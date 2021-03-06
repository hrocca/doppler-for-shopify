const { promisify } = require('util');

const keyShopsByShopDomain = ({ shopDomain }) => `${shopDomain}`;
const keyShopDomainsByDopplerAccountName = ({ dopplerAccountName }) => `shopDomainsByDopplerAccountName:${dopplerAccountName}`;
const keyShopDomainsByDopplerApikey = ({ dopplerApiKey }) => `shopDomainsByDopplerApikey:${dopplerApiKey}`;

class Redis {
  constructor(redis) {
    const options = {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT),
      password: process.env.REDIS_PASSWORD,
    };

    const wrappedClient = redis.createClient(options);
    wrappedClient.on('connect', function() {
      console.info(`Connected to Redis: ${options.host}:${options.port}`);
    });

    this.client = {
      hgetallAsync: promisify(wrappedClient.hgetall).bind(wrappedClient),
      hmsetAsync: promisify(wrappedClient.hmset).bind(wrappedClient),
      delAsync: promisify(wrappedClient.del).bind(wrappedClient),
      quitAsync: promisify(wrappedClient.quit).bind(wrappedClient),
      saddAsync: promisify(wrappedClient.sadd).bind(wrappedClient),
      smembersAsync: promisify(wrappedClient.smembers).bind(wrappedClient),
      sremAsync: promisify(wrappedClient.srem).bind(wrappedClient)
    };
  }

  async storeShopAsync(shopDomain, shop, closeConnection) {
    try {
      await this.client.hmsetAsync(keyShopsByShopDomain({ shopDomain }), shop);
      if (shop.dopplerApiKey) {
        await this.client.saddAsync(keyShopDomainsByDopplerApikey(shop), shopDomain);
      }
      if (shop.dopplerAccountName) {
        await this.client.saddAsync(keyShopDomainsByDopplerAccountName(shop), shopDomain);
      }
    } catch (error) {
      throw new Error(`Error storing shop ${shopDomain}. ${error.toString()}`);
    } finally {
      if (closeConnection) await this.client.quitAsync();
    }
  }

  async _migrateAndGetShopIfExists(shopDomain) {
    const shop = await this.client.hgetallAsync(`shopsByShopDomain:${shopDomain}`);
    if (!shop) {
      return null;
    }
    await this.storeShopAsync(shopDomain, shop);
    // Since I changed the key format two times, it is not easy to know what to delete them automatically
    // await this.client.delAsync(shopDomain);
    // await this.client.sremAsync(`doppler:${shop.dopplerApiKey}`, shopDomain);
    return shop;
  }

  async getShopAsync(shopDomain, closeConnection) {
    try {
      return (await this.client.hgetallAsync(keyShopsByShopDomain({shopDomain})))
        // Temporal workaround to migrate _new old_ shops:
        || (await this._migrateAndGetShopIfExists(shopDomain));
    } catch (error) {
      throw new Error(
        `Error retrieving shop ${shopDomain}. ${error.toString()}`
      );
    } finally {
      if (closeConnection) await this.client.quitAsync();
    }
  }

  async removeShopAsync(shopDomain, closeConnection) {
    try {
      const shop = await this.client.hgetallAsync(keyShopsByShopDomain({ shopDomain }));
      if (shop) {
        await this.client.delAsync(keyShopsByShopDomain({ shopDomain }));
        await this.client.delAsync(`shopsByShopDomain:${shopDomain}`);
        await this.client.sremAsync(keyShopDomainsByDopplerApikey(shop), shopDomain);
        await this.client.sremAsync(keyShopDomainsByDopplerAccountName(shop), shopDomain);
        await this.client.sremAsync(`doppler:${shop.dopplerApiKey}`, shopDomain);
      }
    } catch (error) {
      throw new Error(`Error removing shop ${shopDomain}. ${error.toString()}`);
    } finally {
      if (closeConnection) await this.client.quitAsync();
    }
  }

  async getAllShopDomainsByDopplerDataAsync(dopplerData, closeConnection) {
    return dopplerData.accountName ? (await this.getAllShopDomainsByDopplerAccountNameAsync(dopplerData.accountName, closeConnection))
      : (await this.getAllShopDomainsByDopplerApiKeyAsync(dopplerData.apiKey, closeConnection));
  }

  async getAllShopDomainsByDopplerApiKeyAsync(dopplerApiKey, closeConnection) {
    try {
      const newShops = (await this.client.smembersAsync(keyShopDomainsByDopplerApikey({dopplerApiKey}))) || [];
      // Temporal workaround to also get shops with old format
      const oldShops = (await this.client.smembersAsync(`doppler:${dopplerApiKey}`)) || [];
      // In weird scenarios, it could return more than a shops with the same domain, but I think that it will not occurs
      return newShops.concat(oldShops);
    } catch (error) {
      throw new Error(
        `Error retrieving shops for Doppler account. ${error.toString()}`
      );
    } finally {
      if (closeConnection) await this.client.quitAsync();
    }
  }

  async getAllShopDomainsByDopplerAccountNameAsync(dopplerAccountName, closeConnection) {
    try {
      return (await this.client.smembersAsync(keyShopDomainsByDopplerAccountName({dopplerAccountName}))) || [];
    } catch (error) {
      throw new Error(
        `Error retrieving shops for Doppler account. ${error.toString()}`
      );
    } finally {
      if (closeConnection) await this.client.quitAsync();
    }
  }

  async quitAsync() {
    await this.client.quitAsync();
  }
}

class RedisFactory {
  constructor(redis) {
    this.redis = redis;
  }

  createClient() {
    return new Redis(this.redis);
  }
}

module.exports = redis => {
  return new RedisFactory(redis);
};
