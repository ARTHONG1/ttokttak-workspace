// The web edition's gate: a Google sign-in (Firebase Authentication), then the ID token goes to
// the gateway (/__auth/session), which checks it and opens the trial for this browser session.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js'
import {
  GoogleAuthProvider,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js'

const button = document.getElementById('google')
const msg = document.getElementById('msg')

function say(text, error = false) {
  msg.textContent = text || ''
  msg.classList.toggle('error', error)
}

const REASONS = {
  'not allowed': '이 계정은 아직 사용할 수 없어요. 다른 Google 계정으로 로그인해 주세요.',
  'unverified email': '이메일 인증이 끝난 Google 계정만 쓸 수 있어요.',
  'not a Google sign-in': 'Google 계정으로 로그인해 주세요.',
  'no session cookie': '페이지를 새로 고친 뒤 다시 로그인해 주세요.',
}

let entering = false
async function enter(user) {
  if (entering) return
  entering = true
  button.disabled = true
  say('작업실을 여는 중…')
  try {
    const idToken = await user.getIdToken(true)
    const res = await fetch('/__auth/session', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    })
    if (res.ok) {
      location.replace('/app')
      return
    }
    const body = await res.json().catch(() => ({}))
    say(REASONS[body.reason] || '로그인을 확인하지 못했어요. 잠시 뒤 다시 해 주세요.', true)
  } catch {
    say('서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.', true)
  }
  entering = false
  button.disabled = false
}

async function start() {
  let config
  try {
    config = await (await fetch('/__auth/config', { credentials: 'same-origin' })).json()
  } catch {
    say('서버에 연결하지 못했어요. 페이지를 새로 고쳐 주세요.', true)
    return
  }
  if (!config.required) {
    location.replace('/app')
    return
  }
  const auth = getAuth(initializeApp(config.firebase))
  auth.languageCode = 'ko'
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })

  // back from a redirect sign-in (used when the browser blocked the popup)
  getRedirectResult(auth).catch(() => {})
  // signed in before on this browser: the trial opens without asking again
  onAuthStateChanged(auth, (user) => {
    if (user) void enter(user)
    else {
      button.disabled = false
      say('')
    }
  })

  button.addEventListener('click', async () => {
    button.disabled = true
    say('Google 로그인 창을 여는 중…')
    try {
      const result = await signInWithPopup(auth, provider)
      await enter(result.user)
    } catch (err) {
      const code = (err && err.code) || ''
      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment'
      ) {
        await signInWithRedirect(auth, provider)
        return
      }
      button.disabled = false
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') say('')
      else if (code === 'auth/network-request-failed')
        say('인터넷 연결을 확인한 뒤 다시 해 주세요.', true)
      else say('로그인하지 못했어요. 다시 해 주세요.', true)
    }
  })
}

void start()
