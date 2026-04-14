import Redis from 'ioredis';

class RateLimiter {
    constructor(redisClient, limit, duration) {
        this.redisClient = redisClient;
        this.limit = limit;
        this.duration = duration;
    }

    async isAllowed(key) {
        const current = await this.redisClient.get(key);
        const currentCount = current ? parseInt(current) : 0;

        if (currentCount < this.limit) {
            await this.redisClient.multi()
                .incr(key)
                .expire(key, this.duration)
                .exec();
            return true;
        }
        return false;
    }
}

export default RateLimiter;
