// Minimal concurrency limiter — no external dependency needed.
// createLimiter(15) gives you a `limit` function; wrap any async call in it
// and at most 15 will ever be in flight at once.
function createLimiter(concurrency) {
  let active = 0;
  const queue = [];

  function runNext() {
    if (active >= concurrency || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn()
      .then(resolve, reject)
      .finally(() => {
        active--;
        runNext();
      });
  }

  return function limit(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      runNext();
    });
  };
}

module.exports = createLimiter;
