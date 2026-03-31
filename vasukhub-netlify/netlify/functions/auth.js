const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

exports.handler = async (event) => {
    const path = event.path.replace('/.netlify/functions/auth', '');
    const method = event.httpMethod;

    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    };
    if (method === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    // Регистрация
    if (path === '/register' && method === 'POST') {
        const { username, password } = JSON.parse(event.body);
        if (!username || !password) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Заполните поля' }) };
        }
        // Проверяем, не занят ли логин
        const { data: existing } = await supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .single();
        if (existing) {
            return { statusCode: 409, headers, body: JSON.stringify({ error: 'Пользователь уже существует' }) };
        }
        const hash = bcrypt.hashSync(password, 10);
        const { data: newUser, error } = await supabase
            .from('users')
            .insert({ username, password_hash: hash })
            .select('id, username')
            .single();
        if (error) {
            return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
        }
        const token = jwt.sign({ id: newUser.id, username: newUser.username }, JWT_SECRET, { expiresIn: '7d' });
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, user: newUser, token }),
        };
    }

    // Логин
    if (path === '/login' && method === 'POST') {
        const { username, password } = JSON.parse(event.body);
        const { data: user } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();
        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Неверные данные' }) };
        }
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        const safeUser = { id: user.id, username: user.username, avatar_url: user.avatar_url };
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, user: safeUser, token }),
        };
    }

    // Проверка токена (me)
    if (path === '/me' && method === 'GET') {
        const authHeader = event.headers.authorization;
        if (!authHeader) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
        }
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const { data: user } = await supabase
                .from('users')
                .select('id, username, avatar_url')
                .eq('id', decoded.id)
                .single();
            if (!user) throw new Error();
            return { statusCode: 200, headers, body: JSON.stringify(user) };
        } catch (err) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
        }
    }

    return { statusCode: 404, headers, body: 'Not found' };
};