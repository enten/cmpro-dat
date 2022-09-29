module.exports = {
  displayName: 'cmpro-dat',
  testMatch: ['**/+(*.)+(spec|test).+(ts|js)?(x)'],
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageReporters: ['html'],
  transform: {
    '^.+\\.(ts|js|html)$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        stringifyContentPathRegex: '\\.(html|svg)$',
      }
    ],
  },
  setupFilesAfterEnv: [],
  coverageDirectory: './coverage',
  snapshotSerializers: [],
};
