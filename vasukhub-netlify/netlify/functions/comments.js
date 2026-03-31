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

    // Проверка авторизации
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

    // POST /api/comments - добавить комментарий
    if (event.httpMethod === 'POST') {
        const { mediaId, text } = JSON.parse(event.body);
        if (!mediaId || !text) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'mediaId and text required' }) };
        }
        const { data: newComment, error } = await supabase
            .from('comments')
            .insert({ media_id: mediaId, user_id: userId, text })
            .select('id, text, created_at, users(username)') // подтягиваем имя пользователя
            .single();
        if (error) {
            return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
        }
        // Формируем ответ с именем пользователя
        const { data: user } = await supabase
            .from('users')
            .select('username')
            .eq('id', userId)
            .single();
        const response = {
            id: newComment.id,
            text: newComment.text,
            created_at: newComment.created_at,
            user: user.username,
        };
        return { statusCode: 200, headers, body: JSON.stringify(response) };
    }

    // GET /api/comments?mediaId=xxx - получить комментарии
    if (event.httpMethod === 'GET') {
        const mediaId = event.queryStringParameters?.mediaId;
        if (!mediaId) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'mediaId required' }) };
        }
        const { data, error } = await supabase
            .from('comments')
            .select(`
                id,
                text,
                created_at,
                users (username)
            `)
            .eq('media_id', mediaId)
            .order('created_at', { ascending: true });
        if (error) {
            return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
        }
        const comments = data.map(c => ({
            id: c.id,
            text: c.text,
            created_at: c.created_at,
            user: c.users.username,
        }));
        return { statusCode: 200, headers, body: JSON.stringify(comments) };
    }

    return { statusCode: 404, headers, body: 'Not found' };
};