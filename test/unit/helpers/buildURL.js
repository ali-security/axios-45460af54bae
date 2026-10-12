import assert from 'assert';
import buildURL from '../../../lib/helpers/buildURL.js';

describe('helpers::buildURL (prototype pollution)', function () {
  afterEach(function () {
    delete Object.prototype.serialize;
    delete Object.prototype.encode;
  });

  it('should ignore inherited serializer options', function () {
    let serializeInvoked = false;
    let encodeInvoked = false;

    Object.defineProperty(Object.prototype, 'serialize', {
      value() {
        serializeInvoked = true;
        return 'inherited=1';
      },
      configurable: true,
      writable: true
    });
    Object.defineProperty(Object.prototype, 'encode', {
      value() {
        encodeInvoked = true;
        return 'inherited';
      },
      configurable: true,
      writable: true
    });

    try {
      assert.strictEqual(buildURL('/foo', {value: 'a b'}, {}), '/foo?value=a+b');
      assert.strictEqual(serializeInvoked, false);
      assert.strictEqual(encodeInvoked, false);
    } finally {
      delete Object.prototype.serialize;
      delete Object.prototype.encode;
    }
  });

  it('should still honor own and class-provided serializer options', function () {
    class Serializer {
      serialize(params) {
        return 'custom=' + params.value;
      }
    }

    assert.strictEqual(buildURL('/foo', {value: 'x'}, new Serializer()), '/foo?custom=x');
    assert.strictEqual(buildURL('/foo', {value: 'x'}, {serialize: () => 'own=1'}), '/foo?own=1');
    assert.strictEqual(buildURL('/foo', {value: 'x'}, () => 'fn=1'), '/foo?fn=1');
    assert.strictEqual(buildURL('/foo', {value: 'a b'}, {encode: (v) => String(v).toUpperCase()}), '/foo?VALUE=A B');
  });
});
