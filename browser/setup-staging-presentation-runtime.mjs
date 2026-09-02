export const SETUP_STAGING_STYLE_ID = 'gameroad-setup-staging-presentation-r1';

export const SETUP_STAGING_CSS = `
section[data-screen="setup"] [data-content],
section[data-screen="setup"] [data-mode]{
  min-height:44px !important;
  padding-block:10px !important;
  touch-action:manipulation;
}
section[data-screen="setup"] [data-content].on,
section[data-screen="setup"] [data-mode].on{
  font-weight:800 !important;
  outline:2px solid currentColor;
  outline-offset:-2px;
}
section[data-screen="setup"] #startMatch{
  width:100%;
  min-height:56px !important;
  font-size:clamp(15px,2vw,18px) !important;
  font-weight:800 !important;
  letter-spacing:.02em;
  border-width:2px !important;
  box-shadow:0 8px 24px rgba(0,0,0,.28),0 0 0 1px currentColor;
  touch-action:manipulation;
}
section[data-screen="setup"] #startMatch:not(:disabled){
  filter:brightness(1.12) saturate(1.06);
}
section[data-screen="setup"] #startMatch:focus-visible{
  outline:3px solid currentColor;
  outline-offset:3px;
}
@media (max-width:540px){
  section[data-screen="setup"]{
    overflow-y:auto;
    overscroll-behavior:contain;
  }
  section[data-screen="setup"] [data-content],
  section[data-screen="setup"] [data-mode]{
    min-height:48px !important;
  }
  section[data-screen="setup"] #startMatch{
    position:sticky;
    bottom:max(10px,env(safe-area-inset-bottom));
    z-index:20;
    min-height:60px !important;
    margin-top:12px;
  }
}
@media (max-height:430px) and (orientation:landscape){
  section[data-screen="setup"] [data-content],
  section[data-screen="setup"] [data-mode]{
    min-height:44px !important;
    padding-block:7px !important;
  }
  section[data-screen="setup"] #startMatch{
    min-height:48px !important;
  }
}
`;

export function mountSetupStagingPresentation(root = document) {
  if (!root || typeof root.getElementById !== 'function' || typeof root.createElement !== 'function') return false;
  if (root.getElementById(SETUP_STAGING_STYLE_ID)) return false;
  const head = root.head || root.querySelector?.('head');
  if (!head || typeof head.append !== 'function') return false;
  const style = root.createElement('style');
  style.id = SETUP_STAGING_STYLE_ID;
  style.textContent = SETUP_STAGING_CSS;
  head.append(style);
  return true;
}
