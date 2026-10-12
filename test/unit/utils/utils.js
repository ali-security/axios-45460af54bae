import assert from 'assert';
import utils from '../../../lib/utils.js';
import FormData from 'form-data';
import stream from 'stream';

describe('utils', function (){
  it('should validate Stream', function () {
    assert.strictEqual(utils.isStream(new stream.Readable()),true);
    assert.strictEqual(utils.isStream({ foo: 'bar' }),false);
  });

  it('should validate Buffer', function () {
    assert.strictEqual(utils.isBuffer(Buffer.from('a')),true);
    assert.strictEqual(utils.isBuffer(null),false);
    assert.strictEqual(utils.isBuffer(undefined),false);
  });

  describe('utils::isFormData', function () {
    it('should detect the FormData instance provided by the `form-data` package', function () {
      [1, 'str', {}, new RegExp()].forEach(function (thing) {
        assert.equal(utils.isFormData(thing), false);
      });
      assert.equal(utils.isFormData(new FormData()), true);
    });

    it('should not call toString method on built-in objects instances', () => {
      const buf = Buffer.from('123');

      buf.toString = () => assert.fail('should not be called');

      assert.equal(utils.isFormData(buf), false);
    });

    it('should not call toString method on built-in objects instances, even if append method exists', () => {
      const buf = Buffer.from('123');

      buf.append = () => {};

      buf.toString = () => assert.fail('should not be called');

      assert.equal(utils.isFormData(buf), false);
    });

    it('should detect custom FormData instances by toStringTag signature and append method presence', () => {
      class FormData {
        append(){

        }

        get [Symbol.toStringTag]() {
          return 'FormData';
        }
      }
      assert.equal(utils.isFormData(new FormData()), true);
    });
  });

  describe('toJSON', function (){
    it('should convert to a plain object without circular references', function () {
      const obj= {a: [0]}
      const source = {x:1, y:2, obj};
      source.circular1 = source;
      obj.a[1] = obj;

      assert.deepStrictEqual(utils.toJSONObject(source), {
        x: 1, y:2, obj: {a: [0]}
      });
    });

    it('should use objects with defined toJSON method without rebuilding', function () {
      const objProp = {};
      const obj= {objProp, toJSON(){
        return {ok: 1}
      }};
      const source = {x:1, y:2, obj};

      const jsonObject = utils.toJSONObject(source);

      assert.strictEqual(jsonObject.obj.objProp, objProp);
      assert.strictEqual(JSON.stringify(jsonObject), JSON.stringify({x: 1, y:2, obj: {ok: 1}}))
    });
  });

  describe('prototype pollution safe helpers', function () {
    afterEach(function () {
      delete Object.prototype[Symbol.iterator];
      delete Object.prototype[Symbol.toStringTag];
      delete Object.prototype.polluted;
    });

    it('should ignore inherited symbol properties when validating plain Object', function () {
      Object.prototype[Symbol.iterator] = function* () {
        yield ['x-injected', 'yes'];
      };
      Object.prototype[Symbol.toStringTag] = 'Custom';

      assert.strictEqual(utils.isPlainObject({}), true);
      assert.strictEqual(utils.isPlainObject([]), false);
      assert.strictEqual(utils.isPlainObject({
        [Symbol.iterator]: function* () {
          yield ['x-own', 'yes'];
        }
      }), false);
      assert.strictEqual(utils.isPlainObject({
        [Symbol.toStringTag]: 'Custom'
      }), false);
    });

    it('should treat an object with a genuinely inherited iterator as non-plain', function () {
      // Iterator inherited from a custom (non-Object.prototype) source: this is a
      // real iterable, not prototype pollution, so it must not be classified plain.
      const proto = Object.create(null);
      proto[Symbol.iterator] = function* () {
        yield ['x', '1'];
      };

      assert.strictEqual(utils.isPlainObject(Object.create(proto)), false);
    });

    it('should not read polluted Object.prototype iterator accessors for safe iterable checks', function () {
      let accessed = false;

      Object.defineProperty(Object.prototype, Symbol.iterator, {
        configurable: true,
        get() {
          accessed = true;
          throw new Error('polluted iterator accessor');
        }
      });

      try {
        assert.strictEqual(utils.isSafeIterable({}), false);
        assert.strictEqual(accessed, false);
      } finally {
        delete Object.prototype[Symbol.iterator];
      }

      assert.strictEqual(utils.isSafeIterable([]), true);
      assert.strictEqual(utils.isSafeIterable(new Map()), true);
    });

    it('should stop safe prototype-chain reads on cyclic Proxy prototypes', function () {
      let calls = 0;
      let proxy;
      proxy = new Proxy({}, {
        getPrototypeOf() {
          calls += 1;
          if (calls > 5) {
            throw new Error('cycled');
          }
          return proxy;
        }
      });

      assert.strictEqual(utils.hasOwnInPrototypeChain(proxy, 'missing'), false);
      assert.strictEqual(utils.getSafeProp(proxy, 'missing'), undefined);
      assert.ok(calls <= 2, 'prototype walk did not stop on the cycle; calls=' + calls);
    });

    it('should honor own and template-inherited values but ignore polluted Object.prototype values', function () {
      Object.prototype.polluted = 'yes';

      const template = {encode: 'from-template'};
      const derived = Object.create(template);

      class Options {
        serialize() {
          return 'from-class';
        }
      }

      assert.strictEqual(utils.getSafeProp({}, 'polluted'), undefined);
      assert.strictEqual(utils.getSafeProp({polluted: 'own'}, 'polluted'), 'own');
      assert.strictEqual(utils.getSafeProp(derived, 'encode'), 'from-template');
      assert.strictEqual(utils.getSafeProp(new Options(), 'serialize')(), 'from-class');
      assert.strictEqual(utils.getSafeProp(null, 'polluted'), undefined);
      assert.strictEqual(utils.getSafeProp(undefined, 'polluted'), undefined);
    });
  });
});
