import assert from 'assert';
import formDataToJSON from '../../../lib/helpers/formDataToJSON.js';
import AxiosError from '../../../lib/core/AxiosError.js';
import axios from '../../../index.js';

// Minimal spec-compliant FormData stand-in for runtimes without a global
// FormData (Node < 18), so the depth guards are exercised on every leg.
class FormDataLike {
  constructor() {
    this._entries = [];
  }

  append(name, value) {
    this._entries.push([name, String(value)]);
  }

  entries() {
    return this._entries[Symbol.iterator]();
  }

  [Symbol.iterator]() {
    return this.entries();
  }

  get [Symbol.toStringTag]() {
    return 'FormData';
  }
}

const createFormData = () => (typeof FormData === 'function' ? new FormData() : new FormDataLike());

describe('helpers::formDataToJSON', function () {
  it('should convert a FormData Object to JSON Object', function () {
    const formData = createFormData();

    formData.append('foo[bar][baz]', '123');

    assert.deepStrictEqual(formDataToJSON(formData), {
      foo: {
        bar: {
          baz: '123'
        }
      }
    });
  });

  it('should throw AxiosError when a field path exceeds the default depth limit', function () {
    const formData = createFormData();

    formData.append('foo' + '[bar]'.repeat(101), '123');

    try {
      formDataToJSON(formData);
      throw new Error('Should have thrown');
    } catch (err) {
      assert.ok(err instanceof AxiosError, 'error must be AxiosError, got ' + err);
      assert.strictEqual(err.code, AxiosError.ERR_FORM_DATA_DEPTH_EXCEEDED);
      assert.strictEqual(err.code, 'ERR_FORM_DATA_DEPTH_EXCEEDED');
      assert.ok(!(err instanceof RangeError));
    }
  });

  it('should throw AxiosError while tokenizing very deep field paths', function () {
    const formData = createFormData();

    formData.append('foo' + '[bar]'.repeat(10000), '123');

    try {
      formDataToJSON(formData);
      throw new Error('Should have thrown');
    } catch (err) {
      assert.ok(err instanceof AxiosError, 'error must be AxiosError, got ' + err);
      assert.strictEqual(err.code, 'ERR_FORM_DATA_DEPTH_EXCEEDED');
      assert.ok(!(err instanceof RangeError));
    }
  });

  it('should reject the advisory PoC field path (a[x] x 15000) instead of overflowing the stack', function () {
    const formData = createFormData();

    formData.append('a' + '[x]'.repeat(15000), 'value');

    assert.throws(() => axios.formToJSON(formData), (err) => {
      assert.ok(err instanceof AxiosError, 'error must be AxiosError, got ' + err);
      assert.strictEqual(err.code, 'ERR_FORM_DATA_DEPTH_EXCEEDED');
      return true;
    });
  });

  it('should convert a field path at the default depth limit', function () {
    const formData = createFormData();

    formData.append('foo' + '[bar]'.repeat(100), '123');

    let value = formDataToJSON(formData).foo;

    for (let i = 0; i < 100; i++) {
      value = value.bar;
    }

    assert.strictEqual(value, '123');
  });

  it('should reject deeply nested field paths sent as JSON before adapter dispatch', async function () {
    const formData = createFormData();
    let adapterCalled = false;

    formData.append('foo' + '[bar]'.repeat(101), '123');

    let thrown;

    try {
      await axios.post('http://localhost/', formData, {
        headers: {'Content-Type': 'application/json'},
        adapter(config) {
          adapterCalled = true;
          return Promise.resolve({
            data: null,
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
            request: {}
          });
        }
      });
    } catch (e) {
      thrown = e;
    }

    assert.ok(thrown instanceof AxiosError, 'must be AxiosError, got ' + thrown);
    assert.strictEqual(thrown.code, AxiosError.ERR_FORM_DATA_DEPTH_EXCEEDED);
    assert.strictEqual(adapterCalled, false);
  });
});
