(function Blog() {
	"use strict";

	let offlineIcon;
	let isOnline = ('onLine' in navigator) ? navigator.onLine : true;
	const isLoggedIn = /isLoggedIn=1/.test(document.cookie.toString() || "");
	const usingSW = ('serviceWorker' in navigator);
	let sw;
	let swReg;

	if (usingSW) {
		initServiceWorker().catch(console.error);
	}

	global.isBlogOnline = isBlogOnline;

	document.addEventListener("DOMContentLoaded", ready, false);

	function ready() {
		offlineIcon = document.getElementById("connectivity-status");

		if (!isOnline) {
			offlineIcon.classList.remove('hidden');
		} else {
			offlineIcon.classList.add('hidden');
		}

		window.addEventListener('online', () => {
			offlineIcon.classList.add('hidden');
			isOnline = true;
			sendStatusUpdate();
		});
		window.addEventListener('offline', () => {
			offlineIcon.classList.remove('hidden');
			isOnline = false;
			sendStatusUpdate();
		});
	}

	async function initServiceWorker() {
		swReg = await navigator.serviceWorker.register('/sw.js', {
			updateViaCache: 'none',
		});

		sw = swReg.installing || swReg.waiting || swReg.active;
		sendStatusUpdate(sw);

		navigator.serviceWorker.addEventListener('controllerchange', () => {
			sw = navigator.serviceWorker.controller;
			sendStatusUpdate(sw);
		});

		navigator.serviceWorker.addEventListener('message', onSWMsg);
	}

	function onSWMsg(e) {
		const { data } = e;
		if (data.requestStatusUpdate) {
			console.log('Received status update request from service worker');
			sendStatusUpdate(e.ports && e.ports[0]);
		} else if (data == 'force-logout') {
			document.cookie = 'isLoggedIn=';
			isLoggedIn = false;
			sendStatusUpdate();
		}
	}

	function sendStatusUpdate(target) {
		sendSWMsg({ statusUpdate: { isOnline, isLoggedIn } }, target);
	}

	async function sendSWMsg(msg, target) {
		if (target) {
			target.postMessage(msg);
		} else if (sw) {
			sw.postMessage(msg);
		} else {
			navigator.serviceWorker.controller.postMessage(msg);
		}
	}

	function isBlogOnline() {
		return isOnline;
	}

})();
