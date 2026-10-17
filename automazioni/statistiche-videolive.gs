/** Statistiche giornaliere della VideoLive, senza cookie aggiuntivi.
 * Collegare questo script al Google Sheet e configurare VERCEL_TOKEN
 * nelle Proprietà script. Eseguire installa() una sola volta.
 */
const SHEET_NAME = 'Storico giornaliero';
const PROJECT_ID = 'prj_G20HHWAMhUhOYoR6sO3vl0YFyJEO';
const TEAM_ID = 'team_POkJwb2o8YczGn9OxNlohomJ';
const ROUTE = '/vlcfrattali/';
const TIMEZONE = 'Europe/Rome';

function installa() {
  const token = PropertiesService.getScriptProperties().getProperty('VERCEL_TOKEN');
  if (!token) throw new Error('Configura VERCEL_TOKEN in Impostazioni progetto > Proprietà script');
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'aggiornaStatistiche').forEach(ScriptApp.deleteTrigger);
  ScriptApp.newTrigger('aggiornaStatistiche').timeBased().everyDays(1).atHour(7).create();
  aggiornaStatistiche();
}

function aggiornaStatistiche() {
  const token = PropertiesService.getScriptProperties().getProperty('VERCEL_TOKEN');
  if (!token) throw new Error('VERCEL_TOKEN mancante');
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Foglio Storico giornaliero non trovato');
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const end = Utilities.formatDate(yesterday, 'UTC', 'yyyy-MM-dd');
  const startDate = new Date(yesterday);
  startDate.setUTCDate(startDate.getUTCDate() - 6);
  const start = Utilities.formatDate(startDate, 'UTC', 'yyyy-MM-dd');
  const params = { teamId: TEAM_ID, projectId: PROJECT_ID, since: start, until: end, by: 'day', filter: "requestPath eq '" + ROUTE + "'" };
  const query = Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
  const response = UrlFetchApp.fetch('https://api.vercel.com/v1/query/web-analytics/visits/aggregate?' + query, {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error('Vercel API ' + response.getResponseCode() + ': ' + response.getContentText().slice(0, 400));
  const payload = JSON.parse(response.getContentText());
  if (!Array.isArray(payload.data)) throw new Error('Formato dati API inatteso');
  const existing = sheet.getDataRange().getValues();
  const dates = new Map();
  for (let i = 1; i < existing.length; i++) {
    const key = existing[i][0] instanceof Date ? Utilities.formatDate(existing[i][0], 'UTC', 'yyyy-MM-dd') : String(existing[i][0]).slice(0, 10);
    if (key) dates.set(key, i + 1);
  }
  payload.data.forEach(item => {
    const date = String(item.timestamp || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Data non valida: ' + date);
    const visitors = Number(item.visitors), views = Number(item.pageviews);
    if (!Number.isFinite(visitors) || !Number.isFinite(views)) throw new Error('Contatori Vercel non validi');
    const row = dates.get(date) || sheet.getLastRow() + 1;
    if (!dates.has(date)) {
      sheet.getRange(row, 1, 1, 8).setValues([[date, ROUTE, visitors, views, '', '', '', '']]);
      dates.set(date, row);
    } else {
      sheet.getRange(row, 3, 1, 2).setValues([[visitors, views]]);
    }
    sheet.getRange(row, 7).setFormula('=IF(OR(C' + row + '="",E' + row + '=""),"",E' + row + '/C' + row + '*100)');
  });
}
