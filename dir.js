const fs = require('fs')

const readDir = fs.readdirSync('./编译原理');

readDir.forEach(dirName=>{
  // console.log(`- [${dirName}](./${encodeURI('编译原理')}/${encodeURI(dirName)})`)
  console.log(`- [${dirName}](./编译原理/${dirName})`)
})