const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    };
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    // Проверяем авторизацию
    const authHeader = event.headers.authorization;
    if (!authHeader) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    const token = authHeader.split(' ')[1];
    let userId;
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.id;
    } catch (err) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    // POST /api/likes - поставить/убрать лайк
    if (event.httpMethod === 'POST') {
        const { mediaId } = JSON.parse(event.body);
        if (!mediaId) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'mediaId required' }) };
        }
        // Проверяем, есть ли уже лайк
        const { data: existing } = await supabase
            .from('likes')
            .select('id')
            .eq('media_id', mediaId)
            .eq('user_id', userId)
            .single();
        if (existing) {
            await supabase.from('likes').delete().eq('id', existing.id);
        } else {
            await supabase.from('likes').insert({ media_id: mediaId, user_id: userId });
        }
        // Получаем общее количество лайков
        const { count } = await supabase
            .from('likes')
            .select('*', { count: 'exact', head: true })
            .eq('media_id', mediaId);
        const liked = !existing;
        return { statusCode: 200, headers, body: JSON.stringify({ liked, count }) };
    }

    // GET /api/likes?mediaId=xxx - получить статус лайка и количество для конкретного media
    if (event.httpMethod === 'GET') {
        const mediaId = event.queryStringParameters?.mediaId;
        if (!mediaId) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'mediaId required' }) };
        }
        const { data: like } = await supabase
            .from('likes')
            .select('id')
            .eq('media_id', mediaId)
            .eq('user_id', userId)
            .single();
        const { count } = await supabase
            .from('likes')
            .select('*', { count: 'exact', head: true })
            .eq('media_id', mediaId);
        return { statusCode: 200, headers, body: JSON.stringify({ liked: !!like, count }) };
    }

    return { statusCode: 404, headers, body: 'Not found' };
};