/**
 * Създава admin потребител (email + парола) и му слага ролята 'admin' в Firestore.
 *
 * Пускане:
 *   npm run seed:admin -- <email> <password>
 *   или с env:  ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run seed:admin
 *
 * Как работи:
 *  1. Регистрира потребителя чрез Firebase Auth REST API (accounts:signUp) —
 *     работи само с web API key, без service account.
 *  2. Влиза с email/парола чрез web SDK.
 *  3. Създава/обновява users/{uid} с role: 'admin' — позволява правило
 *     isBootstrapAdminEmail в firestore.rules (D-012).
 *
 * Изисква firestore.rules да е публикуван във Firebase Console.
 */
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { firebaseConfig } from '../src/infra/firebase/config'

const REST_SIGNUP = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp'

function generatePassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let out = ''
  const arr = new Uint32Array(12)
  crypto.getRandomValues(arr)
  for (let i = 0; i < arr.length; i++) out += chars[arr[i] % chars.length]
  return `MamIzb!${out.slice(0, 8)}`
}

async function main() {
  const email = (process.argv[2] ?? process.env.ADMIN_EMAIL ?? '').trim()
  let password = process.argv[3] ?? process.env.ADMIN_PASSWORD ?? ''

  if (!email) {
    console.error('Изисква се имейл: npm run seed:admin -- <email> <password>')
    process.exit(1)
  }
  if (!password) {
    password = generatePassword()
    console.log(`\nПаролата е генерирана: ${password}\n(промени я след първото влизане — Settings → Password)`);
  }

  const app = initializeApp(firebaseConfig, 'admin-seed')
  const db = getFirestore(app)
  const auth = getAuth(app)

  // 1) регистрация през REST (не проваля, ако имейлът е зает)
  console.log(`1/3 Регистрирам/проверявам ${email}...`)
  const res = await fetch(`${REST_SIGNUP}?key=${firebaseConfig.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  const signUp = (await res.json()) as {
    localId?: string
    error?: { message: string }
  }
  if (signUp.error) {
    const msg = signUp.error.message
    if (!msg.startsWith('EMAIL_EXISTS')) {
      console.error(`Регистрацията не успя: ${msg}`)
      process.exit(1)
    }
    console.log('   Имейлът вече е регистриран — влизам в него.')
  }

  // 2) вход (или повторен вход) за сесия
  const cred = await signInWithEmailAndPassword(auth, email, password)
  const uid = cred.user.uid
  console.log(`2/3 Влязох като ${uid}`)

  // 3) users/{uid} с role admin
  const existing = await getDoc(doc(db, 'users', uid))
  if (existing.exists()) {
    const role = existing.data().role
    if (role === 'admin') {
      console.log('3/3 Вече си admin. Нищо за промяна.')
    } else {
      try {
        await setDoc(doc(db, 'users', uid), { role: 'admin' }, { merge: true })
        console.log('3/3 Ролята е променена на admin.')
      } catch (e) {
        console.error(
          `3/3 Не успях да променя ролята ('${role}'): ${(e as Error).message}\n` +
            `   Ръчно: Firebase Console → Firestore → users/${uid} → role: "admin"`,
        )
        process.exit(1)
      }
    }
  } else {
    try {
      await setDoc(doc(db, 'users', uid), {
        displayName: email.split('@')[0],
        email,
        role: 'admin',
        createdAt: serverTimestamp(),
      })
      console.log('3/3 Ролята admin е зададена.')
    } catch (e) {
      console.error(
        `3/3 Не успях да създам admin документа: ${(e as Error).message}\n` +
          `   Провери дали firestore.rules е публикуван с правилата от D-012\n` +
          `   (users create: isBootstrapAdminEmail) и пусни скрипта пак.`,
      )
      process.exit(1)
    }
  }

  console.log('\n=== Входни данни за админ ===')
  console.log(`Имейл:  ${email}`)
  console.log(`Парола: ${password}`)
  console.log('Адрес:  http://localhost:5173/auth (или /admin за панела)')
  process.exit(0)
}

main().catch((e) => {
  console.error('Грешка:', e?.message ?? e)
  process.exit(1)
})
