# Playwriter Recording

## recording.start / recording.stop

Record the page as a video at native FPS (30-60fps). Uses `chrome.tabCapture` so **recording survives page navigation**. Auto-overlays a ghost cursor that follows mouse actions. Requires user to have clicked the Playwriter extension icon on the tab. Auto-resizes viewport to 16:9 (override with `aspectRatio: null`). Auto-stops after 15 min (override with `maxDurationMs`).

For demos, use interaction methods (`locator.click()`, `page.mouse.move()`) instead of `goto()` to show realistic cursor motion.

```js
await recording.start({
  page: state.page,
  outputPath: '/absolute/path/to/recording.mp4',
  frameRate: 30, // default
  audio: false, // default (tab audio)
  videoBitsPerSecond: 2500000,
  aspectRatio: { width: 16, height: 9 }, // default, set null to skip
  maxDurationMs: 15 * 60 * 1000, // default, set 0 to disable
})

// Recording survives navigation
await state.page.click('a')
await state.page.waitForLoadState('domcontentloaded')

// Stop — save full result including executionTimestamps for createDemoVideo
state.recordingResult = await recording.stop({ page: state.page })

// Other: recording.isRecording({ page }), recording.cancel({ page })
```

## ghostCursor.show / ghostCursor.hide

The ghost cursor overlay is always on: the extension injects it on every Playwriter-attached tab and it stays visible at the last spot Playwright clicked or moved. These methods only matter if you want to change the cursor style or temporarily hide it:

```js
await ghostCursor.show({ page: state.page, style: 'screenstudio' }) // 'minimal' (default), 'dot', 'screenstudio'
await ghostCursor.hide({ page: state.page }) // hide until next show() or hard navigation
```

## createDemoVideo

Speeds up idle sections (time between execute() calls) while keeping interactions at normal speed. Requires `ffmpeg`/`ffprobe`. Timestamps are tracked automatically during recording and returned by `recording.stop()`. **Timeout**: can take 60–120+ seconds, always pass `--timeout 120000` or higher.

```js
// After recording.stop(), save full result to state (executionTimestamps powers idle detection)
state.recordingResult = await recording.stop({ page: state.page })

// In a SEPARATE execute call with --timeout 120000:
const demoPath = await createDemoVideo({
  recordingPath: state.recordingResult.path,
  durationMs: state.recordingResult.duration,
  executionTimestamps: state.recordingResult.executionTimestamps,
  speed: 6, // default 6x for idle sections
})
```

