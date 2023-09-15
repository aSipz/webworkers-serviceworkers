"use strict";

const version = 5;
let isOnline = true;
let isLoggedIn = false;
const cacheName = `app-${version}`;
let allPostsCaching = false;

const urlsToCache = {
    loggedOut: [
        '/',
        '/about',
        '/contact',
        '/login',
        '/404',
        '/offline',
        '/css/style.css',
        '/js/blog.js',
        '/js/home.js',
        '/js/login.js',
        '/js/add-post.js',
        '/images/logo.gif',
        '/images/offline.png',
    ],
}

self.addEventListener('install', onInstall);
self.addEventListener('activate', onActivate);
self.addEventListener('message', onMessage);
self.addEventListener('fetch', onFetch);

main().catch(console.error);

async function main() {
    console.log(`Service Worker (${version}) is starting...`);
    await sendMsg({ requestStatusUpdate: true });
    await cacheLoggedOutFiles();
}

function onFetch(e) {
    e.respondWith(router(e.request));
}

async function router(req) {
    const url = new URL(req.url);
    const reqURL = url.pathname;
    const cache = await caches.open(cacheName);

    // request for site's own URL?
    if (url.origin == location.origin) {
        // are we making an API request?
        if (/^\/api\/.+$/.test(reqURL)) {
            let fetchOptions = {
                credentials: "same-origin",
                cache: "no-store"
            };
            let res = await safeRequest(reqURL, req, fetchOptions, cache, /*cacheResponse=*/false,/*checkCacheFirst=*/false,/*checkCacheLast=*/true,/*useRequestDirectly=*/true);
            if (res) {
                if (req.method == "GET") {
                    await cache.put(reqURL, res.clone());
                }
                // clear offline-backup of successful post?
                else if (reqURL == "/api/add-post") {
                    await idbKeyval.del("add-post-backup");
                }
                return res;
            }

            return notFoundResponse();
        }
        // are we requesting a page?
        else if (req.headers.get("Accept").includes("text/html")) {
            // login-aware requests?
            if (/^\/(?:login|logout|add-post)$/.test(reqURL)) {
                let res;

                if (reqURL == "/login") {
                    if (isOnline) {
                        let fetchOptions = {
                            method: req.method,
                            headers: req.headers,
                            credentials: "same-origin",
                            cache: "no-store",
                            redirect: "manual"
                        };
                        res = await safeRequest(reqURL, req, fetchOptions, cache);
                        if (res) {
                            if (res.type == "opaqueredirect") {
                                return Response.redirect("/add-post", 307);
                            }
                            return res;
                        }
                        if (isLoggedIn) {
                            return Response.redirect("/add-post", 307);
                        }
                        res = await cache.match("/login");
                        if (res) {
                            return res;
                        }
                        return Response.redirect("/", 307);
                    }
                    else if (isLoggedIn) {
                        return Response.redirect("/add-post", 307);
                    }
                    else {
                        res = await cache.match("/login");
                        if (res) {
                            return res;
                        }
                        return cache.match("/offline");
                    }
                }
                else if (reqURL == "/logout") {
                    if (isOnline) {
                        let fetchOptions = {
                            method: req.method,
                            headers: req.headers,
                            credentials: "same-origin",
                            cache: "no-store",
                            redirect: "manual"
                        };
                        res = await safeRequest(reqURL, req, fetchOptions, cache);
                        if (res) {
                            if (res.type == "opaqueredirect") {
                                return Response.redirect("/", 307);
                            }
                            return res;
                        }
                        if (isLoggedIn) {
                            isLoggedIn = false;
                            await sendMessage("force-logout");
                            await delay(100);
                        }
                        return Response.redirect("/", 307);
                    }
                    else if (isLoggedIn) {
                        isLoggedIn = false;
                        await sendMessage("force-logout");
                        await delay(100);
                        return Response.redirect("/", 307);
                    }
                    else {
                        return Response.redirect("/", 307);
                    }
                }
                else if (reqURL == "/add-post") {
                    if (isOnline) {
                        let fetchOptions = {
                            method: req.method,
                            headers: req.headers,
                            credentials: "same-origin",
                            cache: "no-store"
                        };
                        res = await safeRequest(reqURL, req, fetchOptions, cache,/*cacheResponse=*/true);
                        if (res) {
                            return res;
                        }
                        res = await cache.match(
                            isLoggedIn ? "/add-post" : "/login"
                        );
                        if (res) {
                            return res;
                        }
                        return Response.redirect("/", 307);
                    }
                    else if (isLoggedIn) {
                        res = await cache.match("/add-post");
                        if (res) {
                            return res;
                        }
                        return cache.match("/offline");
                    }
                    else {
                        res = await cache.match("/login");
                        if (res) {
                            return res;
                        }
                        return cache.match("/offline");
                    }
                }
            }
            // otherwise, just use "network-and-cache"
            else {
                let fetchOptions = {
                    method: req.method,
                    headers: req.headers,
                    cache: "no-store"
                };
                let res = await safeRequest(reqURL, req, fetchOptions, cache,/*cacheResponse=*/false,/*checkCacheFirst=*/false,/*checkCacheLast=*/true);
                if (res) {
                    if (!res.headers.get("X-Not-Found")) {
                        await cache.put(reqURL, res.clone());
                    }
                    else {
                        await cache.delete(reqURL);
                    }
                    return res;
                }

                // otherwise, return an offline-friendly page
                return cache.match("/offline");
            }
        }
        // all other files use "cache-first"
        else {
            let fetchOptions = {
                method: req.method,
                headers: req.headers,
                cache: "no-store"
            };
            let res = await safeRequest(reqURL, req, fetchOptions, cache,/*cacheResponse=*/true,/*checkCacheFirst=*/true);
            if (res) {
                return res;
            }

            // otherwise, force a network-level 404 response
            return notFoundResponse();
        }
    }
}

async function safeRequest(reqURL, req, options, cache, cacheResponse = false, checkCacheFirst = false, checkCacheLast = false, useRequestDirectly = false) {
    let res;

    if (checkCacheFirst) {
        res = await cache.match(reqURL);
        if (res) {
            return res;
        }
    }

    if (isOnline) {
        try {
            if (useRequestDirectly) {
                res = await fetch(req, options);
            }
            else {
                res = await fetch(req.url, options);
            }

            if (res && (res.ok || res.type == "opaqueredirect")) {
                if (cacheResponse) {
                    await cache.put(reqURL, res.clone());
                }
                return res;
            }
        }
        catch (err) { }
    }

    if (checkCacheLast) {
        res = await cache.match(reqURL);
        if (res) {
            return res;
        }
    }
}

async function cacheAllPosts(forceReload = false) {
    if (allPostsCaching) {
        return;
    }
    allPostsCaching = true;
    await delay(5000);
    const cache = await caches.open(cacheName);
    let postIDs;

    try {
        if (isOnline) {
            let fetchOptions = {
                method: "GET",
                cache: "no-store",
                credentials: "omit"
            };
            let res = await fetch("/api/get-posts", fetchOptions);
            if (res && res.ok) {
                await cache.put("/api/get-posts", res.clone());
                postIDs = await res.json();
            }
        } else {
            let res = await cache.match("/api/get-posts");
            if (res) {
                let resCopy = res.clone();
                postIDs = await res.json();
            }
            // caching not started, try to start again (later)
            else {
                allPostsCaching = false;
                return cacheAllPosts(forceReload);
            }
        }
    }
    catch (err) {
        console.error(err);
    }

    if (postIDs && postIDs.length > 0) {
        return cachePost(postIDs.shift());
    } else {
        allPostsCaching = false;
    }

    async function cachePost(postID) {
        const postURL = `/post/${postID}`;
        let needCaching = true;

        if (!forceReload) {
            let res = await cache.match(postURL);
            if (res) {
                needCaching = false;
            }
        }

        if (needCaching) {
            await delay(10000);
            if (isOnline) {
                try {
                    let fetchOptions = {
                        method: "GET",
                        cache: "no-store",
                        credentials: "omit"
                    };
                    let res = await fetch(postURL, fetchOptions);
                    if (res && res.ok) {
                        await cache.put(postURL, res.clone());
                        needCaching = false;
                    }
                } catch (err) { }
            }

            // failed, try caching this post again?
            if (needCaching) {
                return cachePost(postID);
            }
        }

        // any more posts to cache?
        if (postIDs.length > 0) {
            return cachePost(postIDs.shift());
        } else {
            allPostsCaching = false;
        }
    }
}

function notFoundResponse() {
    return new Response('', {
        status: 404,
        statusText: 'Not Found',
    });
}

async function onInstall(e) {
    console.log(`Service Worker (${version}) installed.`);
    self.skipWaiting();
}

function onActivate(e) {
    e.waitUntil(handleActivation());
}

async function handleActivation() {
    await clearCaches();
    await cacheLoggedOutFiles(true);
    await clients.claim();
    console.log(`Service Worker (${version}) activated.`);
}

async function sendMsg(msg) {
    const allClients = await clients.matchAll({ includeUncontrolled: true });
    return Promise.all(
        allClients.map(c => {
            const channel = new MessageChannel();
            channel.port1.onmessage = onMessage;
            return c.postMessage(msg, [channel.port2]);
        }),
    );
}

function onMessage({ data }) {
    if (data.statusUpdate) {
        ({ isOnline, isLoggedIn } = data.statusUpdate);
        console.log(`Service Worker (v${version}) status update, isOnline:${isOnline}, isLoggedIn:${isLoggedIn}`);
    }
}

async function cacheLoggedOutFiles(forceReload = false) {
    const cache = await caches.open(cacheName);

    return Promise.all(
        urlsToCache.loggedOut.map(async url => {
            try {
                let res;
                if (!forceReload) {
                    res = await cache.match(url);
                    if (res) {
                        return res;
                    }
                }

                const fetchOptions = {
                    method: 'GET',
                    credentials: 'omit',
                    cache: 'no-cache',
                };

                res = await fetch(url, fetchOptions);
                if (res.ok) {
                    await cache.put(url, res);
                }
            } catch (error) {
                console.error(error);
            }
        }),
    );
}

async function clearCaches() {
    const cacheNames = await caches.keys();
    const oldCacheNames = cacheNames.filter(c => {
        if (/^app-\d+$/.test(c)) {
            let [_, cacheVersion] = c.match(/^app-(\d+)$/);
            cacheVersion = cacheVersion !== null ? +cacheVersion : cacheVersion;
            return (cacheVersion > 0 && cacheVersion !== version);
        }
    });
    return Promise.all(oldCacheNames.map(c => caches.delete(c)));
}

function delay(ms) {
    return new Promise(res => {
        setTimeout(res, ms);
    });
} 