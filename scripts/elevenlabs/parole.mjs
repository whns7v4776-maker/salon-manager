// Trascrive la voce di un tutorial con ElevenLabs Scribe e salva il tempo di ogni parola,
// così il montaggio può agganciare ogni azione sullo schermo alla parola che la nomina.
// Uso: node --env-file=.env.local scripts/elevenlabs/parole.mjs <audio> <uscita.json>
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { readFileSync, writeFileSync } from 'node:fs';

const [file, uscita] = process.argv.slice(2);
const client = new ElevenLabsClient();
const r = await client.speechToText.convert({ file: new Blob([readFileSync(file)]), modelId: 'scribe_v1', languageCode: 'ita', timestampsGranularity: 'word' });
const parole = (r.words || []).filter(w => w.type === 'word').map(w => ({ w: w.text, a: +w.start.toFixed(3), b: +w.end.toFixed(3) }));
writeFileSync(uscita, JSON.stringify({ testo: r.text, parole }));
console.log(uscita, parole.length, 'parole');
