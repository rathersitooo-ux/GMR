from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one anchor, found {count}: {old[:120]!r}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


html_old = (
    '<script src="./deck-save-recovery-core.mjs"></script>\n'
    '<script type="module">\n'
    'import { resolveScreenNavigation } from "./screen-navigation-core.mjs";'
)
html_new = (
    '<script src="./deck-save-recovery-core.mjs"></script>\n'
    '<script src="./board-facility-state-core.classic.js"></script>\n'
    '<script type="module">\n'
    'import { mountBoardFacilityRuntime } from "./board-facility-runtime-mount.mjs";\n'
    'await mountBoardFacilityRuntime(globalThis);\n'
    '</script>\n'
    '<script type="module">\n'
    'import { resolveScreenNavigation } from "./screen-navigation-core.mjs";'
)
replace_once("browser/GAMEROAD.html", html_old, html_new)

build_replacements = [
    (
        "const defaultCardPresentationCoreSource = path.join(repoRoot, 'browser/card-presentation-core.mjs');\nconst defaultDist = path.join(repoRoot, 'deploy/cloudflare/dist');",
        "const defaultCardPresentationCoreSource = path.join(repoRoot, 'browser/card-presentation-core.mjs');\nconst defaultBoardFacilityClassicSource = path.join(repoRoot, 'browser/board-facility-state-core.classic.js');\nconst defaultBoardFacilityCoreSource = path.join(repoRoot, 'browser/board-facility-state-core.mjs');\nconst defaultBoardFacilityRuntimeMountSource = path.join(repoRoot, 'browser/board-facility-runtime-mount.mjs');\nconst defaultDist = path.join(repoRoot, 'deploy/cloudflare/dist');",
    ),
    (
        "  cardPresentationCoreSource = defaultCardPresentationCoreSource,\n  dist = defaultDist,",
        "  cardPresentationCoreSource = defaultCardPresentationCoreSource,\n  boardFacilityClassicSource = defaultBoardFacilityClassicSource,\n  boardFacilityCoreSource = defaultBoardFacilityCoreSource,\n  boardFacilityRuntimeMountSource = defaultBoardFacilityRuntimeMountSource,\n  dist = defaultDist,",
    ),
    (
        "  expectedCardPresentationCoreBlob = '',\n  sourceCommit = '',",
        "  expectedCardPresentationCoreBlob = '',\n  expectedBoardFacilityClassicBlob = '',\n  expectedBoardFacilityCoreBlob = '',\n  expectedBoardFacilityRuntimeMountBlob = '',\n  sourceCommit = '',",
    ),
    (
        "  const cardPresentationCoreInput = await readFile(cardPresentationCoreSource);\n  const blob = gitBlobSha1(input);",
        "  const cardPresentationCoreInput = await readFile(cardPresentationCoreSource);\n  const boardFacilityClassicInput = await readFile(boardFacilityClassicSource);\n  const boardFacilityCoreInput = await readFile(boardFacilityCoreSource);\n  const boardFacilityRuntimeMountInput = await readFile(boardFacilityRuntimeMountSource);\n  const blob = gitBlobSha1(input);",
    ),
    (
        "  const cardPresentationCoreBlob = gitBlobSha1(cardPresentationCoreInput);\n  if (expectedBlob && blob !== expectedBlob) {",
        "  const cardPresentationCoreBlob = gitBlobSha1(cardPresentationCoreInput);\n  const boardFacilityClassicBlob = gitBlobSha1(boardFacilityClassicInput);\n  const boardFacilityCoreBlob = gitBlobSha1(boardFacilityCoreInput);\n  const boardFacilityRuntimeMountBlob = gitBlobSha1(boardFacilityRuntimeMountInput);\n  if (expectedBlob && blob !== expectedBlob) {",
    ),
    (
        "  if (expectedCardPresentationCoreBlob && cardPresentationCoreBlob !== expectedCardPresentationCoreBlob) {\n    throw new Error(`Card presentation core blob mismatch: expected=${expectedCardPresentationCoreBlob} actual=${cardPresentationCoreBlob}`);\n  }\n\n  await rm(dist, { recursive: true, force: true });",
        "  if (expectedCardPresentationCoreBlob && cardPresentationCoreBlob !== expectedCardPresentationCoreBlob) {\n    throw new Error(`Card presentation core blob mismatch: expected=${expectedCardPresentationCoreBlob} actual=${cardPresentationCoreBlob}`);\n  }\n  if (expectedBoardFacilityClassicBlob && boardFacilityClassicBlob !== expectedBoardFacilityClassicBlob) {\n    throw new Error(`Board facility classic bridge blob mismatch: expected=${expectedBoardFacilityClassicBlob} actual=${boardFacilityClassicBlob}`);\n  }\n  if (expectedBoardFacilityCoreBlob && boardFacilityCoreBlob !== expectedBoardFacilityCoreBlob) {\n    throw new Error(`Board facility core blob mismatch: expected=${expectedBoardFacilityCoreBlob} actual=${boardFacilityCoreBlob}`);\n  }\n  if (expectedBoardFacilityRuntimeMountBlob && boardFacilityRuntimeMountBlob !== expectedBoardFacilityRuntimeMountBlob) {\n    throw new Error(`Board facility runtime mount blob mismatch: expected=${expectedBoardFacilityRuntimeMountBlob} actual=${boardFacilityRuntimeMountBlob}`);\n  }\n\n  await rm(dist, { recursive: true, force: true });",
    ),
    (
        "  const cardPresentationCoreOutputPath = path.join(dist, 'card-presentation-core.mjs');\n  await writeFile(cardPresentationCoreOutputPath, cardPresentationCoreInput);\n  const cardPresentationCoreRoundTrip = await readFile(cardPresentationCoreOutputPath);\n  if (!cardPresentationCoreInput.equals(cardPresentationCoreRoundTrip)) {\n    throw new Error('dist/card-presentation-core.mjs is not byte-identical to Browser dependency source');\n  }\n\n  const headers = [",
        "  const cardPresentationCoreOutputPath = path.join(dist, 'card-presentation-core.mjs');\n  await writeFile(cardPresentationCoreOutputPath, cardPresentationCoreInput);\n  const cardPresentationCoreRoundTrip = await readFile(cardPresentationCoreOutputPath);\n  if (!cardPresentationCoreInput.equals(cardPresentationCoreRoundTrip)) {\n    throw new Error('dist/card-presentation-core.mjs is not byte-identical to Browser dependency source');\n  }\n\n  const boardFacilityClassicOutputPath = path.join(dist, 'board-facility-state-core.classic.js');\n  await writeFile(boardFacilityClassicOutputPath, boardFacilityClassicInput);\n  const boardFacilityClassicRoundTrip = await readFile(boardFacilityClassicOutputPath);\n  if (!boardFacilityClassicInput.equals(boardFacilityClassicRoundTrip)) {\n    throw new Error('dist/board-facility-state-core.classic.js is not byte-identical to Browser dependency source');\n  }\n\n  const boardFacilityCoreOutputPath = path.join(dist, 'board-facility-state-core.mjs');\n  await writeFile(boardFacilityCoreOutputPath, boardFacilityCoreInput);\n  const boardFacilityCoreRoundTrip = await readFile(boardFacilityCoreOutputPath);\n  if (!boardFacilityCoreInput.equals(boardFacilityCoreRoundTrip)) {\n    throw new Error('dist/board-facility-state-core.mjs is not byte-identical to Browser dependency source');\n  }\n\n  const boardFacilityRuntimeMountOutputPath = path.join(dist, 'board-facility-runtime-mount.mjs');\n  await writeFile(boardFacilityRuntimeMountOutputPath, boardFacilityRuntimeMountInput);\n  const boardFacilityRuntimeMountRoundTrip = await readFile(boardFacilityRuntimeMountOutputPath);\n  if (!boardFacilityRuntimeMountInput.equals(boardFacilityRuntimeMountRoundTrip)) {\n    throw new Error('dist/board-facility-runtime-mount.mjs is not byte-identical to Browser dependency source');\n  }\n\n  const headers = [",
    ),
    (
        "      card_presentation_core: provenance(\n        'browser/card-presentation-core.mjs',\n        'card-presentation-core.mjs',\n        cardPresentationCoreInput,\n        cardPresentationCoreBlob,\n      ),\n    },",
        "      card_presentation_core: provenance(\n        'browser/card-presentation-core.mjs',\n        'card-presentation-core.mjs',\n        cardPresentationCoreInput,\n        cardPresentationCoreBlob,\n      ),\n      board_facility_classic: provenance(\n        'browser/board-facility-state-core.classic.js',\n        'board-facility-state-core.classic.js',\n        boardFacilityClassicInput,\n        boardFacilityClassicBlob,\n      ),\n      board_facility_core: provenance(\n        'browser/board-facility-state-core.mjs',\n        'board-facility-state-core.mjs',\n        boardFacilityCoreInput,\n        boardFacilityCoreBlob,\n      ),\n      board_facility_runtime_mount: provenance(\n        'browser/board-facility-runtime-mount.mjs',\n        'board-facility-runtime-mount.mjs',\n        boardFacilityRuntimeMountInput,\n        boardFacilityRuntimeMountBlob,\n      ),\n    },",
    ),
    (
        "    else if (a === '--card-presentation-core-source') out.cardPresentationCoreSource = path.resolve(argv[++i]);\n    else if (a === '--dist') out.dist = path.resolve(argv[++i]);",
        "    else if (a === '--card-presentation-core-source') out.cardPresentationCoreSource = path.resolve(argv[++i]);\n    else if (a === '--board-facility-classic-source') out.boardFacilityClassicSource = path.resolve(argv[++i]);\n    else if (a === '--board-facility-core-source') out.boardFacilityCoreSource = path.resolve(argv[++i]);\n    else if (a === '--board-facility-runtime-mount-source') out.boardFacilityRuntimeMountSource = path.resolve(argv[++i]);\n    else if (a === '--dist') out.dist = path.resolve(argv[++i]);",
    ),
    (
        "    else if (a === '--expected-card-presentation-core-blob') out.expectedCardPresentationCoreBlob = argv[++i] || '';\n    else if (a === '--source-commit') out.sourceCommit = argv[++i] || '';",
        "    else if (a === '--expected-card-presentation-core-blob') out.expectedCardPresentationCoreBlob = argv[++i] || '';\n    else if (a === '--expected-board-facility-classic-blob') out.expectedBoardFacilityClassicBlob = argv[++i] || '';\n    else if (a === '--expected-board-facility-core-blob') out.expectedBoardFacilityCoreBlob = argv[++i] || '';\n    else if (a === '--expected-board-facility-runtime-mount-blob') out.expectedBoardFacilityRuntimeMountBlob = argv[++i] || '';\n    else if (a === '--source-commit') out.sourceCommit = argv[++i] || '';",
    ),
]
for old, new in build_replacements:
    replace_once("deploy/cloudflare/scripts/build.mjs", old, new)

slash = chr(92)
replace_once(
    ".github/workflows/gameroad-required-gate.yml",
    "              browser/board-facility-state-core.classic.js|",
    "              browser/board-facility-state-core.classic.js|" + slash + "\n              browser/board-facility-runtime-mount.mjs|",
)
replace_once(
    ".github/workflows/gameroad-required-gate.yml",
    "              tests/board-facility-classic-adapter.test.mjs)",
    "              tests/board-facility-classic-adapter.test.mjs|" + slash + "\n              tests/board-facility-runtime-mount.test.mjs|" + slash + "\n              tests/board-facility-production-mount.test.mjs)",
)
replace_once(
    ".github/workflows/gameroad-required-gate.yml",
    "        run: node --test tests/board-facility-state-core.test.mjs tests/board-facility-classic-adapter.test.mjs",
    "        run: node --test tests/board-facility-state-core.test.mjs tests/board-facility-classic-adapter.test.mjs tests/board-facility-runtime-mount.test.mjs tests/board-facility-production-mount.test.mjs",
)
