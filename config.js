/* Configuration — the only file you should need to edit after setup. */

window.HUCTW_CONFIG = {

  /* Paste the Power Automate flow URL here, between the quotes.
     You get it from the "When an HTTP request is received" trigger after saving
     the flow the first time. It's long and ends with &sig=... — copy all of it.

     While this is empty the page runs in DEMO MODE with fake data, so you can
     click through the whole thing before the flow exists. */
  FLOW_URL: "https://90b0e8c6bed5e8b5a215745d67dbc7.16.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/02/workflows/e0161b15756f4c39aeebd3d83316eeaa/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=GcO9VFdJ3uz_rzD_TMaozHjiqFzmjWIcaIxBIOs593E",

  /* Days of history the data view requests. */
  HISTORY_DAYS: 90,

  /* Minimum technicians before team totals are shown. 0 = no floor, which is
     the decision as of 12 Aug 2026: the union needs the complete data set, and
     no privacy was promised to technicians. The flow no longer filters on
     Contributors either, so team totals reconcile against HTT_DailyHours.

     Raising this above 0 re-enables the page's suppression notice but does NOT
     re-enable the flow's filter — that clause lives in getData's $filter on the
     two team lists and has to be put back by hand. Restoring a floor also means
     restoring the "these figures will not match a row-by-row count" sentence in
     renderData(), because with a floor they no longer do. */
  MIN_CONTRIBUTORS: 0,
};
