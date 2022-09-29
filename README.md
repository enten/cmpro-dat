# cmpro-dat

[![NPM Version](https://img.shields.io/npm/v/cmpro-dat.svg)](https://npmjs.com/package/cmpro-dat)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A [clrmamepro .dat format](https://github.com/SabreTools/SabreTools/wiki/DatFile-Formats#clrmamepro-format) parser for Node.js.

## Install

```sh
npm install cmpro-dat
```

## Usage

```javascript
const DAT = require('cmpro-dat');

const text = `
clrmamepro (
  name "Nintendo - Super Nintendo Entertainment System"
  description "Nintendo - Super Nintendo Entertainment System"
)

game (
  comment "Chrono Trigger (Japan)"
  origin "Japan"
  rom ( crc 4D014C20 )
)

game (
  comment "Ultimate Mortal Kombat 3 (Europe)"
  origin "US"
  rom ( crc 1C4C54D2 )
)
`;

DAT.parse(text).then(data => {
  console.log(data);
});
// [
//   {
//     __type: 'clrmamepro',
//     name: 'Nintendo - Super Nintendo Entertainment System',
//     description: 'Nintendo - Super Nintendo Entertainment System'
//   },
//   {
//     __type: 'game',
//     comment: 'Chrono Trigger (Japan)',
//     origin: 'Japan',
//     rom: { crc: '4D014C20' }
//   },
//   {
//     __type: 'game',
//     comment: 'Ultimate Mortal Kombat 3 (Europe)',
//     origin: 'US',
//     rom: { crc: '1C4C54D2' }
//   }
// ]
```

## License

[MIT](./LICENSE)
