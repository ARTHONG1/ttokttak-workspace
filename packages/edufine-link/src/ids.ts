/**
 * Fixed identities of the 똑딱 에듀파인 연결 extension. The extension id comes from the
 * public key below (manifest "key"); the matching private key is kept off the repository
 * and goes into the first Chrome Web Store upload so the store keeps this id. Native
 * messaging (allowed_origins) and the web app's direct connection are bound to it.
 */
export const EXTENSION_ID = 'ebjaejdjilpnbcbcejmeeneahkngcmnm'
export const EXTENSION_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyO5FwDlD+zKJ9B8qqKTLsmhvapv71d1kCoIZrkAvgDmmFgNCLiJl4by5X1Ms+D3u7eUBdNSXN3DI226gmHG8eK9+XJOB0x05Ht1LKHYw8ULV9UpBIuvMpr7ziAd0xVvXTTGVRaEmKhBMSmzUJ1uEl9C7CND0aleRR2NaS2tsu78aeHrQfjbp/8RZI91M2vc2xbN9J2756vhWat3+G4grsGkkBRdPSR/1zWcbJbF4InjYXzCIdsAEvQCelC+xVEUnalIH8h+B3mdoGJd0vr06QRCbz6VhgUAgKgp9Tgyju42gkufkJvFmLnGFPCzVg/Yj4lIxoPkB6ImZcq9LiWQDtQIDAQAB'
/** Chrome native messaging host name the desktop app registers */
export const NATIVE_HOST_NAME = 'kr.ttokttak.edufine'
/** 똑딱작업실 web app origins allowed to hand a 품의 to the extension */
export const WEB_APP_ORIGINS = [
  'https://hangul-ai-workbench-545101783843.asia-northeast3.run.app',
  'http://127.0.0.1:5188',
]
/** where the web app serves the current 화면 이름표 */
export const SCREEN_MAP_URL = WEB_APP_ORIGINS[0] + '/edufine/screen-map.json'
