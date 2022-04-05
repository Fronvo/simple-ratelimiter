// **************************************************************** //
//      The ez-iest rate-limiter in existance, for nodejs.         //
// **************************************************************** //

// Interfaces
const EzErrors: { [key: string]: string } = {
    NOT_ENOUGH_POINTS:
        "The consumer doesn't have the required points for consumption.",
};

interface EzLimit {
    points: number;
}

interface EzLimits {
    [key: string]: EzLimit;
}

interface EzOptions {
    maxPoints: number;
    clearDelay: number;
}

interface EzMiddlewareClear {
    rateLimits: EzLimits;
}

interface EzMiddlewareConsumption {
    consumerKey: string;
    rateLimit: EzLimit;
    requestedPoints: number;
}

interface EzMiddleware {
    beforeClear?: ({}: EzMiddlewareClear) => void;
    afterClear?: ({}: EzMiddlewareClear) => void;
    beforeConsumption?: ({}: EzMiddlewareConsumption) => void;
    afterConsumption?: ({}: EzMiddlewareConsumption) => void;
}

export interface EzError extends Error {
    currentPoints: number;
    requestedPoints: number;
    maxPoints: number;
}

// Generic functions
function generateError(
    name: string,
    currentPoints: number,
    requestedPoints: number,
    maxPoints: number
): EzError {
    const errorData: EzError = {
        name,
        message: EzErrors[name],
        currentPoints,
        requestedPoints,
        maxPoints,
    };

    return errorData;
}

// Instances
export class EzRateLimiter {
    readonly maxPoints: number;
    readonly clearDelay: number;

    private isStopped: boolean = true;
    private rateLimits: EzLimits = {};
    private clearIntervalId: number = -1;

    // Middleware
    private beforeClear!: ({}: EzMiddlewareClear) => void;
    private afterClear!: ({}: EzMiddlewareClear) => void;
    private beforeConsumption!: ({}: EzMiddlewareConsumption) => void;
    private afterConsumption!: ({}: EzMiddlewareConsumption) => void;

    constructor(options: EzOptions) {
        this.maxPoints = options.maxPoints;
        this.clearDelay = options.clearDelay || 1000;

        if (this.clearDelay < 1) {
            throw new Error('clearDelay should be higher than 1ms.');
        }

        if (this.maxPoints < 1) {
            throw new Error('maxPoints should be higher than 1.');
        }

        this.start();
    }

    async consumePoints(consumerKey: string, points: number): Promise<EzLimit> {
        if (this.isStopped) {
            throw new Error("Can't consume while the ratelimiter is stopped.");
        }

        if (consumerKey.length == 0) {
            throw new Error("consumerKey can't be empty.");
        }

        if (points < 1) {
            throw new Error("Can't consume less than 1 point.");
        }

        if (this.maxPoints < points) {
            throw new Error(
                "Can't consume more points than maxPoints at once."
            );
        }

        const consumer = this.rateLimits[consumerKey];

        // If consumer doesnt exist, create
        if (!consumer) {
            const consumerData: EzLimit = {
                points,
            };

            if (this.beforeConsumption)
                this.beforeConsumption({
                    consumerKey,
                    rateLimit: consumerData,
                    requestedPoints: points,
                });

            this.rateLimits[consumerKey] = consumerData;

            if (this.afterConsumption)
                this.afterConsumption({
                    consumerKey,
                    rateLimit: consumerData,
                    requestedPoints: points,
                });

            return consumerData;
        } else {
            // If new points will be higher than maxPoints prevent consumption
            if (consumer.points + points > this.maxPoints) {
                throw generateError(
                    'NOT_ENOUGH_POINTS',
                    consumer.points,
                    points,
                    this.maxPoints
                );
            } else {
                // Checks passed, add points and consume
                if (this.beforeConsumption)
                    this.beforeConsumption({
                        consumerKey,
                        rateLimit: consumer,
                        requestedPoints: points,
                    });

                this.rateLimits[consumerKey].points += points;

                if (this.afterConsumption)
                    this.afterConsumption({
                        consumerKey,
                        rateLimit: this.rateLimits[consumerKey],
                        requestedPoints: points,
                    });

                return this.rateLimits[consumerKey];
            }
        }
    }

    async start(): Promise<void> {
        if (!this.isStopped) {
            throw new Error('The rate-limiter has already started!');
        }

        this.clearIntervalId = setInterval(() => {
            if (this.beforeClear)
                this.beforeClear({
                    rateLimits: this.rateLimits,
                });

            for (const rateLimitId in this.rateLimits) {
                // Don't delete key
                this.rateLimits[rateLimitId].points = 0;
            }

            if (this.afterClear)
                this.afterClear({
                    rateLimits: this.rateLimits,
                });
        }, this.clearDelay);

        this.isStopped = false;
    }

    async stop(): Promise<void> {
        if (this.isStopped) {
            throw new Error('The rate-limiter is already stopped!');
        }

        clearInterval(this.clearIntervalId);

        this.isStopped = true;
    }

    $use(middleware: Partial<EzMiddleware>): void {
        if (middleware.beforeClear) this.beforeClear = middleware.beforeClear;
        if (middleware.afterClear) this.afterClear = middleware.afterClear;
        if (middleware.beforeConsumption)
            this.beforeConsumption = middleware.beforeConsumption;
        if (middleware.afterConsumption)
            this.afterConsumption = middleware.afterConsumption;
    }
}
