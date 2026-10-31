// 簡單的令牌桶：cap 次，每秒補 rate 次
class Bucket {
  constructor(cap, rate) { this.cap = cap; this.rate = rate; this.n = cap; this.t = Date.now(); }
  take() {
    const now = Date.now();
    this.n = Math.min(this.cap, this.n + (now - this.t) / 1000 * this.rate);
    this.t = now;
    if (this.n < 1) return false;
    this.n -= 1;
    return true;
  }
}
module.exports = { Bucket };
