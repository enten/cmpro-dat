import * as DAT from './cmpro-dat';

describe('DAT.parse', () => {
  const DAT_FIXTURE = `

clrmamepro (
	name "Nintendo - Super Nintendo Entertainment System"
	description "Nintendo - Super Nintendo Entertainment System"
)

game (
	comment "Chrono Trigger (Japan)"
   origin "Japan"
	rom ( crc 4D014C20  )
)

game ( )

game (
	comment "Ultimate Mortal Kombat 3 (Europe)"
   origin "US"
   origin "Asia"
	rom ( crc 1C4C54D2)
  year 709257600000
  year 861840000000
  foo ( bar ( foobar -10.0 ))

)

`;

  it('should parse dat', async () => {
    expect(DAT.parse(DAT_FIXTURE)).resolves.toEqual([
      {
        __type: 'clrmamepro',
        name: 'Nintendo - Super Nintendo Entertainment System',
        description: 'Nintendo - Super Nintendo Entertainment System',
      },
      {
        __type: 'game',
        comment: 'Chrono Trigger (Japan)',
        origin: 'Japan',
        rom: { crc: '4D014C20' },
      },
      { __type: 'game' },
      {
        __type: 'game',
        comment: 'Ultimate Mortal Kombat 3 (Europe)',
        origin: ['US', 'Asia'],
        rom: { crc: '1C4C54D2' },
        year: ['709257600000', '861840000000'],
        foo: { bar: { foobar: '-10.0' } },
      },
    ]);
  });

  // const stream = fs.createReadStream(file, { encoding: 'utf8' });

  // DAT.parse(text, {
  //   headerRootType: 'clrmamepro',
  //   idFieldName: '__id',
  //   rootTypeFieldName: '__type',
  //   operators: [
  //     DAT.Operators.ignoreHeader(),
  //     DAT.Operators.idAuto(),
  //     // DAT.Operators.filter(x => x.__id < 2),
  //     DAT.Operators.map(x => ({ ...x, z: 'zzz' })),
  //     DAT.Operators.tap(x => {
  //       console.log('ON ENTRY', x);
  //     }),
  //   ],
  //   revivers: [
  //     DAT.Revivers.number('year'),
  //     DAT.Revivers.date('year'),
  //     DAT.Revivers.autoNumber(),
  //     (k, v) => {
  //       console.log('revive', k, v);
  //       return v;
  //     },
  //   ],
  //   signal: abortController.signal,
  // });
});

describe('DAT.stringify', () => {
  const ENTRIES_FIXTURE = [
    {
      __typename: 'clrmamepro',
      name: 'Nintendo - Super Nintendo Entertainment System',
      description: 'Nintendo - Super Nintendo Entertainment System',
    },
    {
      __typename: 'game',
      comment: 'Chrono Trigger (Japan)',
      origin: 'Japan',
      rom: { crc: '4D014C20' },
    },
    { __typename: 'game' },
    {
      __typename: 'game',
      comment: 'Ultimate Mortal Kombat 3 (Europe)',
      origin: ['US', 'Asia'],
      rom: { crc: '1C4C54D2' },
      year: ['709257600000', '861840000000'],
      foo: { bar: { foobar: '-10.0', foobax: 'foo "bar" foobax' }, bax: {} },
      fox: {},
    },
  ];

  const DAT_EXPECTED = `clrmamepro (
  name "Nintendo - Super Nintendo Entertainment System"
  description "Nintendo - Super Nintendo Entertainment System"
)

game (
  comment "Chrono Trigger (Japan)"
  origin Japan
  rom (
    crc 4D014C20
  )
)

game ( )

game (
  comment "Ultimate Mortal Kombat 3 (Europe)"
  origin US
  origin Asia
  rom (
    crc 1C4C54D2
  )
  year 709257600000
  year 861840000000
  foo (
    bar (
      foobar -10.0
      foobax "foo \\"bar\\" foobax"
    )
    bax ( )
  )
  fox ( )
)
`;

  it('should stringify to dat format', () => {
    expect(DAT.stringify(ENTRIES_FIXTURE, { rootTypeFieldName: '__typename' })).toEqual(DAT_EXPECTED);
  });
});
