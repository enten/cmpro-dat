import * as readline from 'readline';
import * as stream from 'stream';

// import 'abort-controller/polyfill';

//#region asian-regexps

const chineseRegStringExp =
  '[\u4E00-\u9FCC\u3400-\u4DB5\uFA0E\uFA0F\uFA11\uFA13\uFA14\uFA1F\uFA21\uFA23\uFA24\uFA27-\uFA29]|[\ud840-\ud868][\udc00-\udfff]|\ud869[\udc00-\uded6\udf00-\udfff]|[\ud86a-\ud86c][\udc00-\udfff]|\ud86d[\udc00-\udf34\udf40-\udfff]|\ud86e[\udc00-\udc1d]';
const japaneseRegStringExp = '[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]';
const koreanRegStringExp = '[\uac00-\ud7af]|[\u1100-\u11ff]|[\u3130-\u318f]|[\ua960-\ua97f]|[\ud7b0-\ud7ff]';
const chineseRegExp = new RegExp('('.concat(chineseRegStringExp, ')+'));
const japaneseRegExp = new RegExp('('.concat(japaneseRegStringExp, ')+'));
const koreanRegExp = new RegExp('('.concat(koreanRegStringExp, ')+'));
const hasChinese = (input: string): boolean => !!input.match(chineseRegExp);
const hasJapanese = (input: string): boolean => !!input.match(japaneseRegExp);
const hasKorean = (input: string): boolean => !!input.match(koreanRegExp);

//#endregion

export type DatParseReviver = (key: string, value: any) => any;

export type DatParseOperator = (entry: any, parsing: DatParsing) => { entry?: any } | null;

export interface DatParseOptions {
  headerRootType?: string;
  idFieldName?: string;
  rootTypeFieldName?: string;
  operators?: DatParseOperator[];
  revivers?: DatParseReviver[];
  signal?: AbortSignal;
}

export type DatParseOp = (parsing: DatParsing, char: string) => DatParseOp;

export interface DatParsing<T = any> {
  headerRootType: string;
  idFieldName: string;
  rootTypeFieldName: string;
  operators: DatParseOperator[];
  revivers: DatParseReviver[];
  signal?: AbortSignal;
  data: T[];
  line: string;
  nLine: number;
  nCol: number;
  op: DatParseOp;
  currRoot: any;
  currEntry: any;
  currParents: any[];
  currParentNames: string[];
  fieldName: string;
}

const CHAR_ALPHANUMERIC_REGEXP = /[a-zA-Z0-9]/;
const CHAR_LETTER_REGEXP = /[a-zA-Z]/;
const CHAR_WORD_REGEXP = /[a-zA-Z0-9\.\{\}:?=&@\\/,'+_-]/;

const isCharAlphanumeric = (char: string): boolean => CHAR_ALPHANUMERIC_REGEXP.test(char);
const isCharBackslash = (char: string): boolean => char === '\\';
const isCharBlank = (char: string): boolean => char === ' ' || char === '\n' || char === '\t' || char === '\r';
const isCharDoublequotes = (char: string): boolean => char === '"';
const isCharLetter = (char: string): boolean => CHAR_LETTER_REGEXP.test(char);
const isCharParenthesisLeft = (char: string): boolean => char === '(';
const isCharParenthesisRight = (char: string): boolean => char === ')';
const isCharAsian = (char: string): boolean => hasChinese(char) || hasJapanese(char) || hasKorean(char);
const isCharWord = (char: string): boolean => CHAR_WORD_REGEXP.test(char) || isCharAsian(char);

const DatParseOperators = {
  filter: (func: (entry: any, parsing: DatParsing) => boolean): DatParseOperator => {
    return (entry, parsing) => (func(entry, parsing) ? { entry } : null);
  },
  idAuto: (id = 0): DatParseOperator => {
    return DatParseOperators.idGenerator(() => id++);
  },
  idGenerator: (func: (entry: any, parsing: DatParsing) => number): DatParseOperator => {
    return (entry, parsing) => {
      entry[parsing.idFieldName] = func(entry, parsing);

      return { entry };
    };
  },
  ignoreHeader: (): DatParseOperator => {
    return DatParseOperators.filter((entry, parsing) => entry[parsing.rootTypeFieldName] !== parsing.headerRootType);
  },
  map: (func: (entry: any, parsing: DatParsing) => any): DatParseOperator => {
    return (entry, parsing) => ({ entry: func(entry, parsing) });
  },
  tap: (func: (entry: any, parsing: DatParsing) => void): DatParseOperator => {
    return (entry, parsing) => {
      func(entry, parsing);

      return { entry };
    };
  },
};

const DatParseRevivers = {
  autoNumber: (): DatParseReviver => {
    return (_key, value) => (typeof value === 'string' && !isNaN(value as any) ? +value : value);
  },
  date: (fieldNames: string | string[]): DatParseReviver => {
    return DatParseRevivers.map(fieldNames, (_key, value) => new Date(isNaN(value) ? Date.parse(value) : +value));
  },
  map: (fieldNames: string | string[], func: DatParseReviver): DatParseReviver => {
    fieldNames = ([] as string[]).concat(fieldNames || []);

    if (!fieldNames.length) {
      return (_key, value) => value;
    }

    return (key, value) => (fieldNames.includes(key) ? func(key, value) : value);
  },
  number: (fieldNames: string | string[]): DatParseReviver => {
    return DatParseRevivers.map(fieldNames, (_key, value) => +value);
  },
};

const isDatParseAborted = (parsing: DatParsing): boolean => !!(parsing.signal && parsing.signal.aborted);

const lineCol = (parsing: DatParsing): string => [parsing.nLine + 1, parsing.nCol + 1].join(':');

function datParse<T = any>(input: string | stream.Readable, options?: DatParseOptions): Promise<T[]> {
  return new Promise((resolve, reject) => {
    if (typeof input === 'string') {
      const string = input;
      input = new stream.Readable();
      input.push(string);
      input.push(null);
    }

    const parsing: DatParsing = {
      headerRootType: options?.headerRootType || 'clrmamepro',
      idFieldName: options?.idFieldName || '__id',
      rootTypeFieldName: options?.rootTypeFieldName || '__type',
      operators: options?.operators || [],
      revivers: options?.revivers || [],
      data: [],
      line: '',
      nLine: -1,
      nCol: -1,
      op: ROOT_TYPE_BEGIN,
      currRoot: undefined,
      currEntry: undefined,
      currParents: [],
      currParentNames: [],
      fieldName: '',
    };

    const lineReader = readline.createInterface({ input });
    let closed = false;
    let rejected = false;
    let resolved = false;

    lineReader.on('close', () => {
      if (!resolved && !rejected) {
        resolved = true;
        resolve(parsing.data);
      }
    });

    lineReader.on('error', err => {
      if (!closed) {
        closed = true;
        lineReader.close();
      }

      if (!rejected) {
        rejected = true;
        reject(err);
      }
    });

    lineReader.on('line', line => {
      try {
        if (!closed) {
          datParseLine(parsing, line);
        }

        if (isDatParseAborted(parsing)) {
          lineReader.close();
        }
      } catch (err) {
        rejected = true;

        if (!closed) {
          closed = true;
          lineReader.close();
        }

        reject(err);
      }
    });
  });
}

function datParseLine(parsing: DatParsing, line: string): DatParsing {
  parsing.line = line;
  parsing.nLine += 1;
  parsing.nCol = -1;

  const lineLength = line.length;

  for (let nCol = 0; nCol < lineLength; ++nCol) {
    if (isDatParseAborted(parsing)) {
      break;
    }

    parsing.nCol = nCol;

    const char = line.charAt(nCol);
    const op = parsing.op;
    const nextOp = op(parsing, char);

    parsing.op = nextOp || op;
  }

  return parsing;
}

function closeCurrentEntry(parsing: DatParsing): any {
  let entry = parsing.currEntry;

  if (entry === parsing.currRoot) {
    for (const op of parsing.operators) {
      if (isDatParseAborted(parsing)) {
        break;
      }

      const opResult = op(entry, parsing);

      if (!opResult) {
        parsing.data.pop();
        break;
      }

      const entryTouched = opResult.entry;

      if (entryTouched !== entry) {
        parsing.data.splice(-1, 1, entryTouched);

        entry = entryTouched;
      }
    }
  }

  entry = parsing.currParents.pop();

  parsing.currEntry = entry;
  parsing.fieldName = parsing.currParentNames.pop() as string;

  if (entry) {
    reviveCurrentEntryField(parsing);
  }

  return entry;
}

function openCurrentEntry(parsing: DatParsing): any {
  const entry = {};
  const parent = parsing.currEntry;

  if (Array.isArray(parent[parsing.fieldName])) {
    parent[parsing.fieldName][parent[parsing.fieldName].length - 1] = entry;
  } else if (parent[parsing.fieldName] !== null) {
    parent[parsing.fieldName] = [parent[parsing.fieldName], entry];
  } else {
    parent[parsing.fieldName] = entry;
  }

  parsing.currEntry = entry;
  parsing.currParents.push(parent);
  parsing.currParentNames.push(parsing.fieldName);

  return entry;
}

function initCurrentEntryField(parsing: DatParsing): void {
  if (parsing.fieldName in parsing.currEntry) {
    if (Array.isArray(parsing.currEntry[parsing.fieldName])) {
      parsing.currEntry[parsing.fieldName].push(null);
    } else {
      parsing.currEntry[parsing.fieldName] = [parsing.currEntry[parsing.fieldName], null];
    }
  } else {
    parsing.currEntry[parsing.fieldName] = null;
  }
}

function concatCurrentEntryField(parsing: DatParsing, str: string): void {
  if (Array.isArray(parsing.currEntry[parsing.fieldName])) {
    parsing.currEntry[parsing.fieldName][parsing.currEntry[parsing.fieldName].length - 1] += str;
  } else {
    parsing.currEntry[parsing.fieldName] += str;
  }
}

function setCurrentEntryField(parsing: DatParsing, value: string): void {
  if (Array.isArray(parsing.currEntry[parsing.fieldName])) {
    parsing.currEntry[parsing.fieldName][parsing.currEntry[parsing.fieldName].length - 1] = value;
  } else {
    parsing.currEntry[parsing.fieldName] = value;
  }
}

function removeCurrentEntryField(parsing: DatParsing): void {
  if (Array.isArray(parsing.currEntry[parsing.fieldName])) {
    parsing.currEntry[parsing.fieldName].pop();
  } else {
    delete parsing.currEntry[parsing.fieldName];
  }
}

function getCurrentEntryField(parsing: DatParsing): any {
  return Array.isArray(parsing.currEntry[parsing.fieldName])
    ? parsing.currEntry[parsing.fieldName][parsing.currEntry[parsing.fieldName].length - 1]
    : parsing.currEntry[parsing.fieldName];
}

function reviveCurrentEntryField(parsing: DatParsing): any {
  const fieldName = parsing.fieldName;
  const currentEntryFieldValue = getCurrentEntryField(parsing);
  let value = currentEntryFieldValue;
  let removeField = false;

  for (const reviver of parsing.revivers) {
    value = reviver(fieldName, value);
    removeField = typeof value === 'undefined';

    if (removeField) {
      break;
    }
  }

  if (removeField) {
    removeCurrentEntryField(parsing);
  } else if (value !== currentEntryFieldValue) {
    setCurrentEntryField(parsing, value);
  }

  return value;
}

function printCodeSnippet(line: string, i: number, message: string): void {
  const from = Math.max(0, i - 10);
  const to = Math.min(line.length - 1, i + 10);
  const trimmed = from > 0;
  const trimmedRight = to < line.length - 1;
  const padding = (trimmed ? 4 : 0) + (i - from);
  const snippet = [
    (trimmed ? '... ' : '') + line.slice(from, to + 1) + (trimmedRight ? ' ...' : ''),
    ' '.repeat(padding) + '^',
    ' '.repeat(padding) + message,
  ].join('\n');

  console.log(snippet);
}

function ROOT_TYPE_BEGIN(parsing: DatParsing, char: string): DatParseOp {
  if (isCharBlank(char)) {
    return ROOT_TYPE_BEGIN;
  }

  if (!isCharLetter(char)) {
    printCodeSnippet(parsing.line, parsing.nCol, `Expecting letter here, but got '${char}'`);
    throw new Error(`ROOT_TYPE_BEGIN: Expecting letter, but got '${char}' (${lineCol(parsing)})`);
  }

  const rootEntry = { [parsing.rootTypeFieldName]: char };

  parsing.currRoot = rootEntry;
  parsing.currEntry = rootEntry;
  parsing.currParents = [];
  parsing.currParentNames = [];

  parsing.data.push(rootEntry);

  return ROOT_TYPE_END;
}

function ROOT_TYPE_END(parsing: DatParsing, char: string): DatParseOp {
  if (isCharBlank(char)) {
    // TODO reviveRootType(parsing.currRoot[parsing.rootTypeFieldName]))

    return ROOT_FIELDS_OPEN_BEGIN;
  }

  if (isCharParenthesisLeft(char)) {
    // TODO reviveRootType(parsing.currRoot[parsing.rootTypeFieldName]))

    return FIELD_NAME_BEGIN;
  }

  if (!isCharAlphanumeric(char)) {
    printCodeSnippet(parsing.line, parsing.nCol, `Expecting alphanumeric here, but got '${char}'`);
    throw new Error(`ROOT_TYPE_END: Expecting alphanumeric, but got '${char}' (${lineCol(parsing)})`);
  }

  parsing.currRoot[parsing.rootTypeFieldName] += char;

  return ROOT_TYPE_END;
}

function ROOT_FIELDS_OPEN_BEGIN(parsing: DatParsing, char: string): DatParseOp {
  if (isCharParenthesisLeft(char)) {
    return FIELD_NAME_BEGIN;
  }

  if (!isCharBlank(char)) {
    printCodeSnippet(parsing.line, parsing.nCol, `Expecting left parenthesis here, but got '${char}'`);
    throw new Error(`ROOT_FIELDS_OPEN_BEGIN: Expecting left parenthesis here, but got '${char}' (${lineCol(parsing)})`);
  }

  return ROOT_FIELDS_OPEN_BEGIN;
}

function FIELD_NAME_BEGIN(parsing: DatParsing, char: string): DatParseOp {
  if (isCharBlank(char)) {
    return FIELD_NAME_BEGIN;
  }

  if (isCharParenthesisRight(char)) {
    return closeCurrentEntry(parsing) ? FIELD_NAME_BEGIN : ROOT_TYPE_BEGIN;
  }

  if (!isCharLetter(char)) {
    printCodeSnippet(parsing.line, parsing.nCol, `Expecting letter here, but got '${char}'`);
    throw new Error(`FIELD_NAME_BEGIN: Expecting letter, but got '${char}' (${lineCol(parsing)})`);
  }

  parsing.fieldName = char;

  return FIELD_NAME_END;
}

function FIELD_NAME_END(parsing: DatParsing, char: string): DatParseOp {
  if (isCharBlank(char)) {
    initCurrentEntryField(parsing);

    return FIELD_VALUE_BEGIN;
  }

  if (isCharParenthesisLeft(char)) {
    openCurrentEntry(parsing);

    return FIELD_NAME_BEGIN;
  }

  if (isCharParenthesisRight(char)) {
    initCurrentEntryField(parsing);

    return closeCurrentEntry(parsing) ? FIELD_NAME_BEGIN : ROOT_TYPE_BEGIN;
  }

  if (!isCharAlphanumeric(char) && char !== '_') {
    printCodeSnippet(parsing.line, parsing.nCol, `Expecting alphanumeric here, but got '${char}'`);
    throw new Error(`FIELD_NAME_END: Expecting alphanumeric, but got '${char}' (${lineCol(parsing)})`);
  }

  parsing.fieldName += char;

  return FIELD_NAME_END;
}

function FIELD_VALUE_BEGIN(parsing: DatParsing, char: string): DatParseOp {
  if (isCharBlank(char)) {
    return FIELD_VALUE_BEGIN;
  }

  if (isCharParenthesisLeft(char)) {
    openCurrentEntry(parsing);

    return FIELD_NAME_BEGIN;
  }

  if (isCharParenthesisRight(char)) {
    return closeCurrentEntry(parsing) ? FIELD_NAME_BEGIN : ROOT_TYPE_BEGIN;
  }

  if (isCharDoublequotes(char)) {
    setCurrentEntryField(parsing, '');

    return FIELD_VALUE_DOUBLEQUOTES_END;
  }

  if (!isCharWord(char)) {
    printCodeSnippet(parsing.line, parsing.nCol, `Expecting word here, but got '${char}'`);
    throw new Error(`FIELD_VALUE_BEGIN: Expecting word, but got '${char}' (${lineCol(parsing)})`);
  }

  setCurrentEntryField(parsing, char);

  return FIELD_VALUE_END;
}

function FIELD_VALUE_DOUBLEQUOTES_END(parsing: DatParsing, char: string): DatParseOp {
  const { line, nCol } = parsing;

  if (isCharBackslash(char) && isCharDoublequotes(line.charAt(nCol + 1))) {
    return FIELD_VALUE_DOUBLEQUOTES_END;
  }

  if (isCharDoublequotes(char) && !isCharBackslash(line.charAt(nCol - 1))) {
    reviveCurrentEntryField(parsing);

    return FIELD_NAME_BEGIN;
  }

  concatCurrentEntryField(parsing, char);

  return FIELD_VALUE_DOUBLEQUOTES_END;
}

function FIELD_VALUE_END(parsing: DatParsing, char: string): DatParseOp {
  if (isCharBlank(char)) {
    reviveCurrentEntryField(parsing);

    return FIELD_NAME_BEGIN;
  }

  if (isCharParenthesisRight(char)) {
    reviveCurrentEntryField(parsing);

    return closeCurrentEntry(parsing) ? FIELD_NAME_BEGIN : ROOT_TYPE_BEGIN;
  }

  if (!isCharWord(char)) {
    printCodeSnippet(parsing.line, parsing.nCol, `Expecting word here, but got '${char}'`);
    throw new Error(`FIELD_VALUE_END: Expecting word, but got '${char}' (${lineCol(parsing)})`);
  }

  concatCurrentEntryField(parsing, char);

  return FIELD_VALUE_END;
}

export { datParse as parse, DatParseOperators as Operators, DatParseRevivers as Revivers };
