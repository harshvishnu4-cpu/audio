#!/usr/bin/env python3
"""
Check that every word in the reading passages is in the speech model's vocabulary.

The engine can only recognise words it knows. A passage word missing from the model's vocabulary
can never be heard, so it would always be marked as skipped, however well it is read.

Reads the vocabulary from the model archive (its language graph holds the word list), then checks
the read-aloud passages and the unseen passages in public/js/course.js, as the scorer says them
(numbers and short forms as words, e.g. "Dr" -> "doctor").

  python3 tools/check_passage_words.py            # uses public/models/en-in.tar.gz
  python3 tools/check_passage_words.py other.tar.gz
"""
import json, struct, subprocess, sys, tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
model = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'public/models/en-in.tar.gz'

# 1. vocabulary: the language graph (Gr.fst) carries the model's word list as an OpenFst symbol table:
#    magic, name, available key, size, then (length-prefixed word, 64-bit key) pairs
with tarfile.open(model) as tar:
    member = next(m for m in tar.getmembers() if m.name.endswith('graph/Gr.fst'))
    data = tar.extractfile(member).read()
p = data.find(struct.pack('<i', 2125658996))
if p < 0: sys.exit('No word list found in the model graph.')
p += 4
n, = struct.unpack_from('<i', data, p); p += 4 + n
_, size = struct.unpack_from('<qq', data, p); p += 16
vocab = set()
for _ in range(size):
    n, = struct.unpack_from('<i', data, p); p += 4
    vocab.add(data[p:p + n].decode('utf-8', 'replace')); p += n + 8
print(f'{len(vocab):,} words in the model vocabulary ({model.name})')

# 2. the passages, as the scorer says them (node runs the real tokenizer and spoken forms)
script = """
global.self = global;
global.AnswerTasks = require('./public/js/tasks.js');
require('./public/js/course.js');
const S = require('./public/js/scoring.js');
const out = [...Course.PASSAGES.filter(p => p.id !== 'own'), ...Course.UNSEEN].map(p => ({
  id: p.id, words: S.tokenize(p.text).flatMap(t => { const f = S.spokenForms(t.n); return f ? f[0] : [t.n]; }),
  questions: (p.questions || []).map(q => [q.q, ...q.options].join(' ')),
}));
console.log(JSON.stringify(out));
"""
passages = json.loads(subprocess.check_output(['node', '-e', script], cwd=ROOT))

bad = 0
for p in passages:
    missing = sorted({w for w in p['words'] if w not in vocab})
    print(f"{p['id']:<20} {len(p['words']):>3} words  " + ('ok' if not missing else 'NOT IN THE MODEL: ' + ', '.join(missing)))
    bad += len(missing)
sys.exit(1 if bad else 0)
