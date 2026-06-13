require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_ANON_KEY || 'placeholder-key'
);

async function addLog(message, type = 'info') {
  const entry = { message, type, time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) };
  const { error } = await supabase.from('logs').insert(entry);
  if (error) console.error('addLog DB error:', error.message);
  console.log(`[${type.toUpperCase()}] ${message}`);
  return entry;
}
async function savePost(post) {
  const { data, error } = await supabase.from('posts').insert(post).select().single();
  if (error) { console.error('savePost:', error.message); return post; }
  return data;
}
async function updatePost(id, updates) {
  const { error } = await supabase.from('posts').update(updates).eq('id', id);
  if (error) console.error('updatePost:', error.message);
}
async function getLogs(limit = 50) {
  const { data } = await supabase.from('logs').select('*').order('created_at', { ascending: false }).limit(limit);
  return data || [];
}
async function getPosts(limit = 50) {
  const { data } = await supabase.from('posts').select('*').order('created_at', { ascending: false }).limit(limit);
  return data || [];
}
async function getQueuedPosts() {
  const { data } = await supabase.from('posts').select('*').eq('status', 'queued').order('scheduled_at', { ascending: true });
  return data || [];
}
async function saveIntelReport(report) {
  const { data, error } = await supabase.from('intel_reports').insert(report).select().single();
  if (error) { console.error('saveIntelReport:', error.message); return report; }
  return data;
}
async function getIntelReports(limit = 20) {
  const { data } = await supabase.from('intel_reports').select('*').order('created_at', { ascending: false }).limit(limit);
  return data || [];
}
async function getRecentPublishedPosts(days = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await supabase.from('posts').select('*').eq('status', 'published').gte('created_at', since);
  return data || [];
}
async function saveMetrics(m) {
  const { error } = await supabase.from('metrics').insert(m);
  if (error) console.error('saveMetrics:', error.message);
}
async function getWeekMetrics(days = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await supabase.from('metrics').select('*, posts(angle,tone,platform,ab_variant)').gte('collected_at', since);
  return data || [];
}
async function readStrategyMemory(week) {
  const { data } = await supabase.from('strategy_memory').select('*').eq('week', week).single();
  return data || null;
}
async function writeStrategyMemory(week, memory) {
  const { error } = await supabase.from('strategy_memory').upsert({ week, ...memory, updated_at: new Date().toISOString() }, { onConflict: 'week' });
  if (error) console.error('writeStrategyMemory:', error.message);
}
async function saveBusinessMetrics(m) {
  const { error } = await supabase.from('business_metrics').insert(m);
  if (error) console.error('saveBusinessMetrics:', error.message);
}
async function getWeekBusinessMetrics(days = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await supabase.from('business_metrics').select('*').gte('recorded_at', since);
  return data || [];
}
async function getLatestStrategy() {
  const { data } = await supabase
    .from('strategy_memory')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1);
  return data?.[0] || null;
}
async function getBusinessMetricsHistory() {
  const { data } = await supabase
    .from('business_metrics')
    .select('*')
    .order('recorded_at', { ascending: false })
    .limit(100);
  return data || [];
}
function getCurrentWeek() {
  const now = new Date();
  // ISO 8601: week containing the first Thursday of the year is week 1
  const jan4 = new Date(now.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const diff = now - startOfWeek1;
  const week = Math.floor(diff / (7 * 86400000)) + 1;
  const year = week >= 52 && now.getMonth() === 0 ? now.getFullYear() - 1
             : week === 1  && now.getMonth() === 11 ? now.getFullYear() + 1
             : now.getFullYear();
  return `${year}-${String(week).padStart(2, '0')}`;
}

module.exports = {
  supabase, addLog, savePost, updatePost, getLogs, getPosts, getQueuedPosts,
  saveIntelReport, getIntelReports, getRecentPublishedPosts,
  saveMetrics, getWeekMetrics, readStrategyMemory, writeStrategyMemory,
  saveBusinessMetrics, getWeekBusinessMetrics, getCurrentWeek,
  getLatestStrategy, getBusinessMetricsHistory
};
