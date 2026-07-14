/* NVFace — browser face-recognition engine wrapping @vladmandic/face-api.
   Uses the CPU backend (WebGL shader-linking fails inside sandboxed iframes).
   API:
     NVFace.ready()                      -> Promise, resolves once models are loaded
     NVFace.progress(cb)                 -> subscribe to {stage, ready} status
     NVFace.scanImage(imgEl)             -> Promise<number[][]>  (one 128-d descriptor per face — for indexing)
     NVFace.detectPrimary(imgEl)         -> Promise<number[]|null>  (largest face only — for a selfie query)
     NVFace.distance(a, b)               -> euclidean distance
     NVFace.bestDistance(query, list)    -> smallest distance to any descriptor in list
     NVFace.match(query, list, th)       -> { dist, hit } (hit = dist < th)
     NVFace.THRESHOLD                    -> default match cutoff (lower = stricter)
*/
(function () {
  var CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api';
  var SCRIPT = CDN + '/dist/face-api.js';
  var MODELS = CDN + '/model/';
  var state = { booting: false, ready: false, stage: 'idle' };
  var listeners = [];
  var readyResolve, readyReject, readyPromise = new Promise(function (r, j) { readyResolve = r; readyReject = j; });

  function emit(stage) { state.stage = stage; listeners.forEach(function (cb) { try { cb({ stage: stage, ready: state.ready }); } catch (e) {} }); }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.faceapi) return resolve();
      var s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = function () { reject(new Error('Échec du chargement du moteur facial')); };
      document.head.appendChild(s);
    });
  }

  async function boot() {
    if (state.ready) return;
    if (state.booting) return readyPromise;
    state.booting = true;
    try {
      emit('loading-engine');
      await loadScript(SCRIPT);
      await faceapi.tf.setBackend('cpu');
      await faceapi.tf.ready();
      emit('loading-models');
      await faceapi.nets.ssdMobilenetv1.loadFromUri(MODELS);
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODELS);
      await faceapi.nets.faceRecognitionNet.loadFromUri(MODELS);
      state.ready = true;
      emit('ready');
      readyResolve();
    } catch (e) {
      emit('error');
      state.booting = false;
      readyReject(e);
      throw e;
    }
  }

  function area(box) { return (box && box.width && box.height) ? box.width * box.height : 0; }

  var NVFace = {
    THRESHOLD: 0.54,        // vladmandic recommends 0.5–0.6; 0.54 balances recall/precision
    STRONG: 0.45,           // below this = high-confidence match
    get isReady() { return state.ready; },
    get stage() { return state.stage; },
    ready: function () { boot(); return readyPromise; },
    progress: function (cb) { listeners.push(cb); cb({ stage: state.stage, ready: state.ready }); return function () { listeners = listeners.filter(function (x) { return x !== cb; }); }; },

    // All faces in an image — used when indexing a gallery photo. Lower confidence = higher recall.
    scanImage: async function (img) {
      await this.ready();
      var opt = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3, maxResults: 50 });
      var res = await faceapi.detectAllFaces(img, opt).withFaceLandmarks().withFaceDescriptors();
      return res.map(function (r) { return Array.from(r.descriptor); });
    },

    // The single most prominent face — used for a client's selfie / uploaded query photo.
    // Picks the LARGEST face so a group selfie still keys on the person in front.
    detectPrimary: async function (img) {
      await this.ready();
      var opt = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.2, maxResults: 50 });
      var res = await faceapi.detectAllFaces(img, opt).withFaceLandmarks().withFaceDescriptors();
      if (!res.length) return null;
      res.sort(function (a, b) { return area(b.detection.box) - area(a.detection.box); });
      return Array.from(res[0].descriptor);
    },

    distance: function (a, b) {
      var s = 0; for (var i = 0; i < a.length; i++) { var d = a[i] - b[i]; s += d * d; } return Math.sqrt(s);
    },
    bestDistance: function (query, list) {
      var best = Infinity;
      for (var i = 0; i < list.length; i++) { var d = this.distance(query, list[i]); if (d < best) best = d; }
      return best;
    },
    // Returns {dist, hit, strong} for a query against one photo's face list.
    match: function (query, list, th) {
      var d = this.bestDistance(query, list || []);
      var cut = th || this.THRESHOLD;
      return { dist: d, hit: d < cut, strong: d < this.STRONG };
    }
  };

  window.NVFace = NVFace;
})();
