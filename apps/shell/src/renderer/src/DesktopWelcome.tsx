import poster from './assets/promo-poster.webp'
import './desktop-entry.css'

interface DesktopWelcomeProps {
  onConnect: () => void
  onStart: () => void
}

/** The installed app's offline rendition of the public website's introduction. */
export function DesktopWelcome({ onConnect, onStart }: DesktopWelcomeProps) {
  return (
    <div className="desktop-welcome" data-screen="welcome">
      <div className="dw-background" aria-hidden="true"><i /><i /><span /></div>
      <header className="dw-nav">
        <a className="dw-brand" href="#welcome" aria-label="똑딱작업실 첫 화면">
          <svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#f5f5f2" /><rect x="9" y="15" width="5" height="9" rx="2.5" fill="#07080b" /><rect x="18" y="8" width="5" height="16" rx="2.5" fill="#ffd60a" /></svg>
          <span>똑딱작업실</span>
        </a>
        <nav className="dw-links" aria-label="메뉴">
          <a href="#show">둘러보기</a>
          <a href="#universe">오픈소스</a>
          <a href="#credits">만든 이유</a>
        </nav>
        <button className="dw-nav-cta" type="button" onClick={onStart}>시작하기</button>
      </header>

      <main id="welcome">
        <section className="dw-hero">
          <button className="dw-pill" type="button" onClick={onConnect}>
            <i aria-hidden="true" />내 AI 에이전트 연결<span>Codex 연결하기 →</span>
          </button>
          <h1><span>말 한마디에</span><span>문서가 <em>똑딱</em>.</span></h1>
          <p className="dw-sub">한글 · 워드 · 엑셀 · PPT · PDF. 고칠 곳을 말하면<br className="dw-break" /> AI가 문서 안에서 바로 고치고, 바뀐 곳을 보여 줍니다.</p>
          <div className="dw-cta">
            <button className="dw-btn dw-btn-primary" type="button" onClick={onConnect}>
              연결하기 <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button className="dw-btn dw-btn-ghost" type="button" onClick={onStart}>
              시작하기<small>내 작업실</small>
            </button>
          </div>
        </section>

        <section className="dw-show" id="show" aria-label="똑딱작업실 둘러보기">
          <div className="dw-stage">
            <div className="dw-beam" aria-hidden="true" />
            <div className="dw-frame">
              <div className="dw-chrome"><span className="dw-dots"><i /><i /><i /></span><span>똑딱작업실 — 31초 소개</span></div>
              <div className="dw-shot"><img src={poster} alt="똑딱작업실의 실제 문서 편집·AI 작업 화면 미리보기" /></div>
            </div>
          </div>
          <p className="dw-formats"><span>HWP</span><span>HWPX</span><span>DOCX</span><span>XLSX</span><span>PPTX</span><span>PDF</span></p>
        </section>

        <section className="dw-universe" id="universe">
          <p className="dw-kicker">함께 만든 우주</p>
          <h2>575개의 오픈소스가<br />하나로 이어져 움직입니다.</h2>
          <p>점 하나가 프로그램 하나, 선 하나가 서로 기대는 관계입니다. 가운데 똑딱작업실에서 편집기 10개로, 다시 수백 개의 공개 프로젝트로 뻗어 나갑니다.</p>
          <div className="dw-stats"><div><b>575</b><span>오픈소스</span></div><div><b>1,559</b><span>이어진 관계</span></div><div><b>10</b><span>편집기</span></div></div>
        </section>
        <section className="dw-credits" id="credits">
          <p className="dw-kicker">만든 이유</p>
          <h2>문서 일에서 해방되어,<br />더 중요한 일에 시간을 쓰도록.</h2>
          <p>똑딱작업실은 문서 작업만 돕는 도구가 아닙니다. 학교와 사무실의 반복되는 업무를 AI로 덜어 내고, 사람은 확인과 결정에 집중하게 하려고 만들었습니다. 오픈소스 위에서 만들었고, 고친 것은 모두 다시 오픈소스로 공개합니다.</p>
          <button className="dw-btn dw-btn-primary" type="button" onClick={onConnect}>Codex 연결하기 →</button>
        </section>
      </main>
      <footer className="dw-footer"><span>똑딱작업실 · 오픈소스 AI 문서 작업실</span><span>내 PC의 Codex를 연결해 사용합니다.</span></footer>
    </div>
  )
}
