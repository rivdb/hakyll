/* Unlocks a password-protected post (see "Locked posts" in site.hs).
 *
 * The page carries {iter, salt, data}: data is iv || AES-256-GCM ciphertext
 * || tag, under a key derived from the password with PBKDF2-HMAC-SHA256.
 * Inside is {body, description, toc, assets, bundle}; if the post has images, `bundle` is a
 * second file sealed with the same key, fetched only after a good password.
 */
(function () {
  "use strict";

  var form = document.getElementById("unlock");
  var payloadEl = document.getElementById("locked-payload");
  if (!form || !payloadEl) return;

  var input = document.getElementById("unlock-password");
  var status = document.getElementById("unlock-status");
  var payload = JSON.parse(payloadEl.textContent);
  var failures = 0;
  var busy = false;

  if (!window.crypto || !crypto.subtle) {
    // WebCrypto only exists on secure origins (https, or localhost).
    status.textContent = "can't decrypt here: this page needs to be served over https.";
    input.disabled = true;
    return;
  }

  function fromBase64(s) {
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function deriveKey(password) {
    return crypto.subtle
      .importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: "PBKDF2", hash: "SHA-256", salt: fromBase64(payload.salt), iterations: payload.iter },
          base,
          { name: "AES-GCM", length: 256 },
          false,
          ["decrypt"]
        );
      });
  }

  // sealed = iv (12 bytes) || ciphertext || tag (16 bytes)
  function open(key, sealed) {
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: sealed.subarray(0, 12) }, key, sealed.subarray(12));
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy || !input.value) return;
    busy = true;
    status.textContent = "decrypting…";

    var key;
    deriveKey(input.value)
      .then(function (k) {
        key = k;
        return open(key, fromBase64(payload.data));
      })
      .then(
        function (plain) {
          reveal(JSON.parse(new TextDecoder().decode(plain)), key);
        },
        function () {
          // GCM authentication failed: wrong password.
          failures++;
          busy = false;
          status.textContent = failures >= 3
            ? "sudo: " + failures + " incorrect password attempts"
            : "Sorry, try again.";
          input.value = "";
          input.focus();
        }
      )
      .catch(function (err) {
        busy = false;
        status.textContent = "something went wrong while unlocking.";
        console.error(err);
      });
  });

  function reveal(post, key) {
    // Parse into an inert <template> first: nothing in it loads yet, so the
    // private images can be held back until the bundle is decrypted.
    var tpl = document.createElement("template");
    tpl.innerHTML = post.body;
    var held = [];
    if (post.bundle && post.assets.length) {
      var wanted = new Set(post.assets);
      tpl.content.querySelectorAll("[src], [href]").forEach(function (el) {
        ["src", "href"].forEach(function (attr) {
          var v = el.getAttribute(attr);
          if (v && wanted.has(v)) {
            el.removeAttribute(attr);
            el.setAttribute("data-locked-" + attr, v);
            held.push(el);
          }
        });
      });
    }

    var prose = document.querySelector(".prose");
    prose.replaceChildren(tpl.content);
    document.querySelectorAll(".post-locked").forEach(function (el) { el.textContent = "unlocked"; });

    if (post.description) {
      var desc = document.createElement("p");
      desc.className = "post-description p-summary";
      desc.textContent = post.description;
      document.querySelector(".post-header").appendChild(desc);
    }

    if (post.toc) {
      document.querySelectorAll("[data-toc]").forEach(function (nav) {
        nav.innerHTML = post.toc;
        nav.hidden = false;
      });
      document.querySelectorAll(".toc-inline").forEach(function (d) { d.hidden = false; });
    }

    // main.js: code block buttons, contents highlighting
    document.dispatchEvent(new CustomEvent("rivers:content"));

    var target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) target.scrollIntoView();
    else prose.focus({ preventScroll: true });

    if (held.length) loadImages(post.bundle, key, held, prose);
  }

  function loadImages(url, key, held, prose) {
    var note = document.createElement("p");
    note.className = "unlock-status";
    note.textContent = "decrypting images…";
    prose.prepend(note);

    fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error("bundle: HTTP " + r.status);
        return r.arrayBuffer();
      })
      .then(function (buf) { return open(key, new Uint8Array(buf)); })
      .then(function (plain) {
        // 4-byte big-endian header length, JSON header, then the files.
        var bytes = new Uint8Array(plain);
        var headerLen = new DataView(plain).getUint32(0);
        var index = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + headerLen)));
        var offset = 4 + headerLen;
        var blobs = {};
        index.forEach(function (f) {
          blobs[f.url] = URL.createObjectURL(new Blob([bytes.subarray(offset, offset + f.size)], { type: f.type }));
          offset += f.size;
        });
        held.forEach(function (el) {
          ["src", "href"].forEach(function (attr) {
            var v = el.getAttribute("data-locked-" + attr);
            if (v && blobs[v]) {
              el.setAttribute(attr, blobs[v]);
              el.removeAttribute("data-locked-" + attr);
            }
          });
        });
        note.remove();
      })
      .catch(function (err) {
        note.textContent = "couldn't load the images for this post.";
        console.error(err);
      });
  }
})();
