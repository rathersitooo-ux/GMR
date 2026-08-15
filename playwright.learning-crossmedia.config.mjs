import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir:'./tests',
  testMatch:'learning-crossmedia-whitebox.spec.mjs',
  timeout:45_000,
  expect:{timeout:5_000},
  fullyParallel:false,
  workers:1,
  retries:0,
  reporter:[['line'],['html',{outputFolder:'playwright-report-learning-crossmedia',open:'never'}]],
  use:{baseURL:'http://127.0.0.1:4174',browserName:'chromium',headless:true,trace:'retain-on-failure',screenshot:'only-on-failure',video:'off',viewport:{width:390,height:844},hasTouch:true,isMobile:true},
  webServer:{command:'python3 -m http.server 4174 --bind 127.0.0.1',url:'http://127.0.0.1:4174/browser/learning-crossmedia-whitebox.html',reuseExistingServer:false,timeout:120_000},
});
