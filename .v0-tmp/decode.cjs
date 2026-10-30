const fs = require('fs')
function decode(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  const start = lines.findIndex(l => l.startsWith('<continued-line'))
  let out = ''
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i]
    if (l.startsWith('</continued-line') || l.startsWith('<continued-line')) continue
    if (/^"/.test(l) && /"$/.test(l)) { out += JSON.parse(l); continue }
    break
  }
  return out
}
for (const n of ['part1','part2']) {
  const raw = decode(`.v0-tmp/${n}-record.md`)
  fs.writeFileSync(`.v0-tmp/${n}-raw.txt`, raw)
  console.log(n, raw.length)
}
