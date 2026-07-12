const jobs = [];

if (document.querySelector("[data-x7-article-shell]")) {
  jobs.push(import("./cockpit.js").then((module) => module.initCockpit()));
}

if (document.querySelector("[data-x7-search-dialog]")) {
  jobs.push(import("./search-dialog.js").then((module) => module.initSearchDialog()));
}

if (document.querySelector("[data-x7-constellation]")) {
  jobs.push(import("./constellation.js").then((module) => module.initConstellation()));
}

Promise.allSettled(jobs).then((results) => {
  for (const result of results) {
    if (result.status === "rejected") {
      console.warn("X7 enhancement unavailable", result.reason);
    }
  }
});
