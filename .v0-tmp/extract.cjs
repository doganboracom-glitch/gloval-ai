const fs = require('fs')
for (const n of ['part1','part2']) {
  let raw = fs.readFileSync(`.v0-tmp/${n}-raw.txt`, 'utf8').trim()
  raw = raw.replace(/^"answer":\s*/, '').replace(/,$/, '')
  const text = JSON.parse(raw)
  fs.writeFileSync(`.v0-tmp/${n}-answer.md`, text)
  const blocks = [...text.matchAll(/```sql\n([\s\S]*?)```/g)].map(m => m[1])
  blocks.forEach((b, i) => fs.writeFileSync(`.v0-tmp/${n}-block${i}.sql`, b))
  console.log(n, 'blocks', blocks.length, blocks.map(b => b.length))
}
