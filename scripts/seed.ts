/**
 * Seed скрипт — пълни приложението с демо данни (категории, потребители, продукти,
 * ревюта, гласове, доклади). Данните НЕ са hardcode-нати в кода, а се четат от
 * `scripts/seed-data.json`. Всички записи минават през реалните услуги/правила,
 * така че структурата и агрегатите (ratingSum/reviewsCount/netScore) са коректни.
 *
 * Употреба:
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... SEED_PASSWORD=... npm run seed
 *   npm run seed -- --check      # само валидация, без мрежови заявки
 *
 * Забележки:
 *  - Изисква `firestore.rules` да е публикуван (иначе admin операциите се отказват).
 *  - `SEED_PASSWORD` е паролата на демо акаунтите; при повторно пускане трябва да е същата.
 *  - Скриптът е идемпотентен: съществуващи записи се прескачат.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { collection, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore'
import { firebaseConfig, getDb } from '../src/infra/firebase/config'
import { getServices } from '../src/infra/di'
import type { AppUser } from '../src/core/domain/entities/user'

type SeedStatus = 'pending' | 'approved' | 'rejected'
type VoteType = 'up' | 'down'

interface SeedCategory {
  name: string
  slug: string
  icon: string
}
interface SeedUser {
  key: string
  displayName: string
  email: string
}
interface SeedProduct {
  key: string
  brand: string
  model: string
  categorySlug: string
  status: SeedStatus
  author: string
  imageUrl?: string | null
  rejectionReason?: string
}
interface SeedReview {
  product: string
  author: string
  rating: number
  text: string
}
interface SeedVote {
  product: string
  reviewAuthor: string
  voter: string
  type: VoteType
}
interface SeedReport {
  product: string
  reviewAuthor: string
  reporter: string
  reason: string
}
interface SeedData {
  categories: SeedCategory[]
  users: SeedUser[]
  products: SeedProduct[]
  reviews: SeedReview[]
  votes: SeedVote[]
  reports: SeedReport[]
}

const REST_SIGNUP = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp'

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

function loadData(): SeedData {
  const path = fileURLToPath(new URL('./seed-data.json', import.meta.url))
  return JSON.parse(readFileSync(path, 'utf8')) as SeedData
}

function validate(data: SeedData): string[] {
  const problems: string[] = []
  const catSlugs = new Set(data.categories.map((c) => c.slug))
  const userKeys = new Set<string>(['admin', ...data.users.map((u) => u.key)])
  const productKeys = new Set(data.products.map((p) => p.key))

  const seenProducts = new Set<string>()
  for (const p of data.products) {
    if (seenProducts.has(p.key)) problems.push(`продукт: дублиран key "${p.key}"`)
    seenProducts.add(p.key)
    if (!catSlugs.has(p.categorySlug)) problems.push(`продукт ${p.key}: непознат categorySlug "${p.categorySlug}"`)
    if (!userKeys.has(p.author)) problems.push(`продукт ${p.key}: непознат автор "${p.author}"`)
    if (p.status === 'rejected' && !p.rejectionReason)
      problems.push(`продукт ${p.key}: статус rejected без rejectionReason`)
  }

  const reviewKeys = new Set<string>()
  for (const r of data.reviews) {
    if (!productKeys.has(r.product)) problems.push(`ревю: непознат продукт "${r.product}"`)
    if (!userKeys.has(r.author)) problems.push(`ревю: непознат автор "${r.author}"`)
    const k = `${r.product}|${r.author}`
    if (reviewKeys.has(k)) problems.push(`ревю: дубликат за ${k}`)
    reviewKeys.add(k)
    if (!Number.isInteger(r.rating) || r.rating < 1 || r.rating > 5)
      problems.push(`ревю ${k}: рейтингът трябва да е цяло число 1..5`)
    if (r.text.trim().length < 10) problems.push(`ревю ${k}: текстът трябва да е поне 10 символа`)
  }

  for (const v of data.votes) {
    const k = `${v.product}|${v.reviewAuthor}`
    if (!reviewKeys.has(k)) problems.push(`глас: липсва ревю ${k}`)
    if (!userKeys.has(v.voter)) problems.push(`глас: непознат гласуващ "${v.voter}"`)
    if (v.voter === v.reviewAuthor) problems.push(`глас: "${v.voter}" гласува собствено ревю ${k}`)
  }

  for (const rep of data.reports) {
    const k = `${rep.product}|${rep.reviewAuthor}`
    if (!reviewKeys.has(k)) problems.push(`доклад: липсва ревю ${k}`)
    if (!userKeys.has(rep.reporter)) problems.push(`доклад: непознат подател "${rep.reporter}"`)
    if (rep.reporter === rep.reviewAuthor) problems.push(`доклад: подателят е автор на ревюто ${k}`)
    if (rep.reason.trim().length < 5) problems.push(`доклад ${k}: причината е твърде кратка`)
  }
  return problems
}

async function ensureAuthUser(email: string, password: string): Promise<void> {
  const res = await fetch(`${REST_SIGNUP}?key=${firebaseConfig.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  const json = (await res.json()) as { error?: { message: string } }
  if (json.error && !json.error.message.startsWith('EMAIL_EXISTS')) {
    throw new Error(`Регистрация на ${email} не успя: ${json.error.message}`)
  }
}

interface RegEntry {
  email: string
  password: string
  displayName: string
  user?: AppUser
}

async function main() {
  const data = loadData()
  const problems = validate(data)
  if (problems.length) {
    console.error('Невалидни seed данни:')
    for (const p of problems) console.error(` - ${p}`)
    process.exit(1)
  }

  const args = new Set(process.argv.slice(2))
  console.log(
    `Seed план: ${data.categories.length} категории, ${data.users.length} демо потребители, ` +
      `${data.products.length} продукта, ${data.reviews.length} ревюта, ` +
      `${data.votes.length} гласа, ${data.reports.length} доклада.`,
  )
  if (args.has('--check')) {
    console.log('--check: данните са валидни (без мрежови заявки).')
    return
  }

  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD
  const seedPassword = process.env.SEED_PASSWORD
  if (!adminEmail || !adminPassword) {
    console.error('Липсват ADMIN_EMAIL / ADMIN_PASSWORD.')
    process.exit(1)
  }
  if (!seedPassword) {
    console.error('Липсва SEED_PASSWORD (парола за демо акаунтите).')
    process.exit(1)
  }

  const services = getServices()
  const db = getDb()

  const registry = new Map<string, RegEntry>()
  let signedIn: string | null = null

  async function use(key: string): Promise<AppUser> {
    const entry = registry.get(key)
    if (!entry) throw new Error(`Непознат потребител: ${key}`)
    if (signedIn === key && entry.user) return entry.user
    const u = await services.auth.signInWithEmail(entry.email, entry.password)
    signedIn = key
    if (entry.displayName && u.displayName !== entry.displayName) {
      await updateDoc(doc(db, 'users', u.id), { displayName: entry.displayName })
      entry.user = { ...u, displayName: entry.displayName }
    } else {
      entry.user = u
    }
    return entry.user
  }

  // 0) admin сесия + демо акаунти
  console.log('\n1/6 Потребители…')
  await ensureAuthUser(adminEmail, adminPassword)
  registry.set('admin', { email: adminEmail, password: adminPassword, displayName: '' })
  await use('admin')
  for (const u of data.users) {
    await ensureAuthUser(u.email, seedPassword)
    registry.set(u.key, { email: u.email, password: seedPassword, displayName: u.displayName })
  }
  console.log(`   admin + ${data.users.length} демо акаунта са налични.`)

  // 1) категории
  console.log('2/6 Категории…')
  await use('admin')
  const catSnap = await getDocs(collection(db, 'categories'))
  const catIdByName = new Map<string, string>()
  catSnap.forEach((d) => catIdByName.set(String(d.data().name), d.id))
  const catIdBySlug = new Map<string, string>()
  let catsCreated = 0
  for (const c of data.categories) {
    let id = catIdByName.get(c.name)
    if (!id) {
      const created = await services.moderation.addCategory({ name: c.name, icon: c.icon }, await use('admin'))
      id = created.id
      catIdByName.set(c.name, id)
      catsCreated++
    }
    catIdBySlug.set(c.slug, id)
  }
  console.log(`   ${catsCreated} нови, ${data.categories.length - catsCreated} съществуващи.`)

  // 2) продукти (създават се като pending от автора, после admin задава статуса)
  console.log('3/6 Продукти…')
  await use('admin')
  const prodSnap = await getDocs(collection(db, 'products'))
  const prodIdByKeyName = new Map<string, string>()
  prodSnap.forEach((d) => {
    const x = d.data()
    prodIdByKeyName.set(`${norm(String(x.brand))}|${norm(String(x.model))}`, d.id)
  })
  const productIdByKey = new Map<string, string>()
  let prodCreated = 0
  let prodSkipped = 0
  for (const p of data.products) {
    const keyName = `${norm(p.brand)}|${norm(p.model)}`
    const existing = prodIdByKeyName.get(keyName)
    if (existing) {
      productIdByKey.set(p.key, existing)
      prodSkipped++
      continue
    }
    const author = await use(p.author)
    const created = await services.products.addProduct(
      { brand: p.brand, model: p.model, categoryId: catIdBySlug.get(p.categorySlug)!, imageUrl: p.imageUrl ?? undefined },
      author,
    )
    const admin = await use('admin')
    if (p.status === 'approved') await services.products.approve(created.id, admin)
    else if (p.status === 'rejected')
      await services.products.reject(created.id, p.rejectionReason ?? 'Не отговаря на изискванията.', admin)
    productIdByKey.set(p.key, created.id)
    prodIdByKeyName.set(keyName, created.id)
    prodCreated++
  }
  console.log(`   ${prodCreated} нови, ${prodSkipped} съществуващи.`)

  // 3) ревюта (id = uid на автора)
  console.log('4/6 Ревюта…')
  const reviewIdByKey = new Map<string, string>()
  let revCreated = 0
  let revSkipped = 0
  for (const r of data.reviews) {
    const productId = productIdByKey.get(r.product)!
    const author = await use(r.author)
    const existing = await getDoc(doc(db, 'products', productId, 'reviews', author.id))
    if (existing.exists()) {
      reviewIdByKey.set(`${r.product}|${r.author}`, author.id)
      revSkipped++
      continue
    }
    await services.reviews.addReview({ productId, rating: r.rating, text: r.text.trim() }, author)
    reviewIdByKey.set(`${r.product}|${r.author}`, author.id)
    revCreated++
  }
  console.log(`   ${revCreated} нови, ${revSkipped} съществуващи.`)

  // 4) гласове
  console.log('5/6 Гласове…')
  let votesCreated = 0
  let votesSkipped = 0
  for (const v of data.votes) {
    const productId = productIdByKey.get(v.product)!
    const reviewId = reviewIdByKey.get(`${v.product}|${v.reviewAuthor}`)!
    const voter = await use(v.voter)
    const existing = await getDoc(doc(db, 'products', productId, 'reviews', reviewId, 'votes', voter.id))
    if (existing.exists()) {
      votesSkipped++
      continue
    }
    await services.votes.toggle(productId, reviewId, v.type, voter)
    votesCreated++
  }
  console.log(`   ${votesCreated} нови, ${votesSkipped} съществуващи.`)

  // 5) доклади
  console.log('6/6 Доклади…')
  await use('admin')
  const reportSnap = await getDocs(collection(db, 'reports'))
  const existingReports = new Set<string>()
  reportSnap.forEach((d) => {
    const x = d.data()
    existingReports.add(`${x.productId}|${x.reviewId}|${x.userId}`)
  })
  let reportsCreated = 0
  let reportsSkipped = 0
  for (const rep of data.reports) {
    const productId = productIdByKey.get(rep.product)!
    const reviewId = (await use(rep.reviewAuthor)).id
    const reporter = await use(rep.reporter)
    const key = `${productId}|${reviewId}|${reporter.id}`
    if (existingReports.has(key)) {
      reportsSkipped++
      continue
    }
    await services.reviews.reportReview(productId, reviewId, rep.reason, reporter)
    existingReports.add(key)
    reportsCreated++
  }
  console.log(`   ${reportsCreated} нови, ${reportsSkipped} съществуващи.`)

  console.log('\nГотово. Seed данните са качени успешно.')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Грешка при seed:', e instanceof Error ? e.message : e)
    process.exit(1)
  })
