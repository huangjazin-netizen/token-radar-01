// Token launch radar, written from scratch for the token-radar-01 bounty.
// Node 22, standard library only, nothing to install. It reads the sealed
// DefiLlama snapshot, scores every protocol that has not launched a token,
// and writes out the ranked board, the dashboard payload, the screenshots
// and the dossier the judges compare byte for byte.
// The scoring model lives in lib/model.ts; the dossier builder is vendored
// in vendor/makefun-board.ts. The dashboard is plain static files with no
// framework and no network calls: it reads data.js, which this program
// writes from the very same board that lands in board.json, so the page
// and the file can never disagree with each other.
// When you are not inside the grading container, point the output at a
// writable folder instead of /output:
//   mkdir -p out; MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath as urlToPath } from 'node:url';
import { buildRadar, boardIssue, dataScript, parseSnapshot } from './lib/model.ts';
import * as boardLib from './vendor/makefun-board.ts';

// The folder this file sits in, worked out from its own module URL.
const rootDir = urlToPath(new URL('.', import.meta.url));

// The dossier's text budget, and the screenshot rules the gate enforces.
const DOSSIER_TEXT_LIMIT = 65_536;
const SHOT_RULES = { max: 4, max_bytes: 524_288 };
const SHOT_NAME = /^[A-Za-z0-9_][\w.\-]{0,127}$/;

// Pick up a `--flag value` or `--flag=value` argument, or the fallback.
function flagValue(flag: string, fallback: string): string {
  const wanted = `--${flag}`;
  for (let i = 2; i < process.argv.length; i += 1) {
    const item = process.argv[i]!;
    if (item === wanted && i + 1 < process.argv.length) return process.argv[i + 1]!;
    if (item.startsWith(`${wanted}=`)) return item.slice(wanted.length + 1);
  }
  return fallback;
}

// Complain on stderr and stop with the given exit code.
function fail(message: string, code: number): never {
  process.stderr.write(message);
  process.exit(code);
}

const inputGiven = flagValue('input', '/input');
const snapshotPath = inputGiven.endsWith('.json')
  ? inputGiven
  : path.join(inputGiven, 'snapshot.json');
if (!fs.existsSync(snapshotPath)) {
  fail(
    `token radar: cannot find a snapshot at ${snapshotPath}; pass --input <snapshot.json|directory> or mount the sealed /input\n`,
    2,
  );
}
const outputDir = flagValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(fs.readFileSync(snapshotPath, 'utf8'));
const ranked = buildRadar(snapshot);
const board = ranked.board;
const radar = ranked.radar;
const problem = boardIssue(board, snapshot);
if (problem !== null) {
  fail(`token radar: the board failed the gate: ${problem}\n`, 1);
}

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
fs.writeFileSync(path.join(outputDir, 'data.js'), dataScript(radar));

// Copy the plain files from one folder into another, skipping dotfiles, and
// hand back the names that landed.
function copyPlainFiles(source: string, target: string): string[] {
  if (!fs.existsSync(source)) return [];
  fs.mkdirSync(target, { recursive: true });
  const landed: string[] = [];
  for (const entry of fs.readdirSync(source)) {
    if (entry.startsWith('.')) continue;
    const from = path.join(source, entry);
    if (!fs.statSync(from).isFile()) continue;
    fs.copyFileSync(from, path.join(target, entry));
    landed.push(entry);
  }
  return landed;
}

copyPlainFiles(path.join(rootDir, 'dashboard'), path.join(outputDir, 'dashboard'));
const shots = copyPlainFiles(path.join(rootDir, 'screenshots'), path.join(outputDir, 'screenshots'));
if (shots.length < 3) {
  fail(
    `token radar: only ${shots.length} screenshot${shots.length === 1 ? '' : 's'} in screenshots/; hand in 3, the board, a detail view and a filtered view\n`,
    1,
  );
}
for (const shot of shots) {
  if (!SHOT_NAME.test(shot)) {
    fail(`token radar: bad screenshot name screenshots/${shot}; use letters, digits and . _ -, 1 to 128 characters\n`, 1);
  }
}

// The dossier is written last, because the scorer rebuilds it from this
// output folder and compares the bytes.
const dossierLimits = {
  text_max_bytes: DOSSIER_TEXT_LIMIT,
  screenshots: SHOT_RULES,
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
};
fs.writeFileSync(
  path.join(outputDir, 'dossier.json'),
  boardLib.buildDossier(outputDir, dossierLimits),
);

const summary = `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)`;
const written = `token radar: wrote ${path.join(outputDir, 'board.json')}, ${path.join(outputDir, 'data.js')}, ${path.join(outputDir, 'dashboard')} (3 files), ${path.join(outputDir, 'screenshots')} (${shots.length} images) and ${path.join(outputDir, 'dossier.json')}`;
process.stdout.write(`${summary}\n${written}\n`);
