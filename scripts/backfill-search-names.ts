/**
 * Backfill `searchName` on existing products.
 *
 * Older documents were created before the searchable `searchName` field existed,
 * so prefix search (catalog) could not see them. This script recomputes the field
 * from brand + model for every product.
 *
 * Uses the Firestore REST API (not the web SDK) so it also runs in constrained
 * environments such as CI sandboxes.
 *
 * Usage:
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run backfill:search-names
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run backfill:search-names -- --dry-run
 *
 * Requires firestore.rules to be deployed with the moderator `searchName` update
 * branch (see firestore.rules) and admin credentials (admins are moderators).
 */
import { firebaseConfig } from '../src/infra/firebase/config'
import { searchNameOf } from '../src/core/domain/entities/product'

const PROJECT = firebaseConfig.projectId
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`
const AUTH_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseConfig.apiKey}`

interface FirestoreValue {
  stringValue?: string
  nullValue?: null
}

interface FirestoreDocument {
  name: string
  fields: Record<string, FirestoreValue>
}

async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  const json = (await res.json()) as { idToken?: string; error?: { message: string } }
  if (!res.ok || !json.idToken) {
    throw new Error(`Входът не успя: ${json.error?.message ?? res.status}`)
  }
  return json.idToken
}

async function listProducts(idToken: string): Promise<FirestoreDocument[]> {
  const res = await fetch(`${BASE}:runQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'products' }] } }),
  })
  const rows = (await res.json()) as Array<{ document?: FirestoreDocument; error?: { message: string } }>
  const error = rows.find((row) => row.error)
  if (error?.error) throw new Error(`Четенето не успя: ${error.error.message}`)
  return rows.flatMap((row) => (row.document ? [row.document] : []))
}

async function updateSearchName(idToken: string, docName: string, searchName: string): Promise<void> {
  const url = `https://firestore.googleapis.com/v1/${docName}?updateMask.fieldPaths=searchName`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ fields: { searchName: { stringValue: searchName } } }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(body.error?.message ?? `HTTP ${res.status}`)
  }
}

async function main() {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  const dryRun = process.argv.includes('--dry-run')

  if (!email || !password) {
    console.error('Липсват ADMIN_EMAIL / ADMIN_PASSWORD.')
    process.exit(1)
  }

  const idToken = await signIn(email, password)
  const products = await listProducts(idToken)

  let updated = 0
  let unchanged = 0
  let failed = 0

  for (const document of products) {
    const id = document.name.split('/').pop() ?? document.name
    const brand = document.fields.brand?.stringValue ?? ''
    const model = document.fields.model?.stringValue ?? ''
    const current = document.fields.searchName?.stringValue
    const desired = searchNameOf(brand, model)

    if (current === desired) {
      unchanged++
      continue
    }
    if (dryRun) {
      console.log(`[dry-run] ${id} (${brand} ${model}): "${current ?? ''}" -> "${desired}"`)
      updated++
      continue
    }
    try {
      await updateSearchName(idToken, document.name, desired)
      updated++
    } catch (error) {
      failed++
      console.error(`Грешка при ${id}:`, error instanceof Error ? error.message : error)
    }
  }

  console.log(
    `\n${dryRun ? '[dry-run] ' : ''}сканирани: ${products.length}, обновени: ${updated}, без промяна: ${unchanged}, грешки: ${failed}`,
  )
  if (failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error('Грешка:', error instanceof Error ? error.message : error)
  process.exit(1)
})
