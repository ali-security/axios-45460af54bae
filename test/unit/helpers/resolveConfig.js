import assert from 'assert';
import resolveConfig from '../../../lib/helpers/resolveConfig.js';

describe('helpers::resolveConfig (prototype pollution)', function () {
  afterEach(function () {
    delete Object.prototype.username;
    delete Object.prototype.password;
    delete Object.prototype.serialize;
    delete Object.prototype.encode;
    delete Object.prototype.paramsSerializer;
    delete Object.prototype.params;
    delete Object.prototype.data;
  });

  it('should ignore inherited nested auth fields', function () {
    // resolveConfig builds the Basic header with the global btoa (Node >= 16).
    if (typeof btoa === 'undefined') {
      this.skip();
      return;
    }

    Object.defineProperty(Object.prototype, 'username', {
      value: 'inherited-user',
      configurable: true,
      writable: true
    });
    Object.defineProperty(Object.prototype, 'password', {
      value: 'inherited-pass',
      configurable: true,
      writable: true
    });

    try {
      const config = resolveConfig({
        url: '/foo',
        auth: {}
      });

      assert.strictEqual(config.headers.get('Authorization'), 'Basic Og==');
    } finally {
      delete Object.prototype.username;
      delete Object.prototype.password;
    }
  });

  it('should still encode own nested auth fields', function () {
    if (typeof btoa === 'undefined') {
      this.skip();
      return;
    }

    const config = resolveConfig({
      url: '/foo',
      auth: {username: 'user', password: 'pass'}
    });

    assert.strictEqual(config.headers.get('Authorization'), 'Basic ' + Buffer.from('user:pass').toString('base64'));
  });

  it('should ignore inherited nested serializer fields', function () {
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
      const config = resolveConfig({
        url: '/foo',
        params: {value: 'a b'},
        paramsSerializer: {}
      });

      assert.strictEqual(config.url, '/foo?value=a+b');
      assert.strictEqual(serializeInvoked, false);
      assert.strictEqual(encodeInvoked, false);
    } finally {
      delete Object.prototype.serialize;
      delete Object.prototype.encode;
    }
  });

  it('should ignore an inherited paramsSerializer and params', function () {
    let serializerInvoked = false;

    Object.defineProperty(Object.prototype, 'paramsSerializer', {
      value() {
        serializerInvoked = true;
        return 'inherited=1';
      },
      configurable: true,
      writable: true
    });

    try {
      const config = resolveConfig({
        url: '/foo',
        params: {value: 'a b'}
      });

      assert.strictEqual(config.url, '/foo?value=a+b');
      assert.strictEqual(serializerInvoked, false);
    } finally {
      delete Object.prototype.paramsSerializer;
    }

    Object.defineProperty(Object.prototype, 'params', {
      value: {inherited: '1'},
      configurable: true,
      writable: true
    });

    try {
      assert.strictEqual(resolveConfig({url: '/foo'}).url, '/foo');
    } finally {
      delete Object.prototype.params;
    }
  });

  it('should not expose an inherited data value as the request body', function () {
    Object.defineProperty(Object.prototype, 'data', {
      value: 'inherited-body',
      configurable: true,
      writable: true
    });

    try {
      const config = resolveConfig({url: '/foo', method: 'get'});

      assert.strictEqual(Object.prototype.hasOwnProperty.call(config, 'data'), true);
      assert.strictEqual(config.data, undefined);
    } finally {
      delete Object.prototype.data;
    }

    assert.strictEqual(resolveConfig({url: '/foo', method: 'post', data: 'own-body'}).data, 'own-body');
  });
});
