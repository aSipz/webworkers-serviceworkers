"use strict";

let curFib = 0;

self.onmessage = onMessage;

function onMessage(e) {
	getNextFib();
}

function getNextFib() {
	const fibNum = fib(curFib);
	self.postMessage({ idx: curFib, fib: fibNum });
	curFib++;
	setTimeout(getNextFib(), 0);
}

function fib(n) {
	if (n < 2) {
		return n;
	}
	return fib(n - 1) + fib(n - 2);
}
