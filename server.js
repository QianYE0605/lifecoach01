require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
const port = process.env.PORT || 3007;

// 配置CORS和JSON解析中间件
app.use(cors());
app.use(express.json());

// DeepSeek R1 API配置
const API_KEY = process.env.API_KEY;
const API_URL = process.env.API_URL;

// 系统提示词，定义AI助手的角色
const SYSTEM_PROMPT = `你是一位专业的生活教练，拥有丰富的心理学和个人发展知识。你的目标是：
1. 通过倾听和提问，帮助用户发现自己的潜力和目标
2. 提供实用的建议和行动计划
3. 保持积极、支持的态度，同时保持专业和客观
4. 在合适的时候提供激励和鼓励
5. 帮助用户建立良好的习惯和思维方式

请用温暖、专业的语气与用户交流，避免生硬或过于正式的表达。`;

// 处理聊天请求的路由
app.post('/chat', async (req, res) => {
    try {
        const userMessage = req.body.message;
        if (!userMessage) {
            throw new Error('消息内容不能为空');
        }

        // 准备API请求数据
        const requestData = {
            model: 'deepseek-r1-250120',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userMessage }
            ],
            temperature: 0.6,
            stream: true
        };

        // 发送请求到DeepSeek R1 API
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API响应错误:', {
                status: response.status,
                statusText: response.statusText,
                error: errorText
            });
            res.status(response.status).json({
                error: 'API请求失败',
                message: errorText
            });
            return;
        }

        // 设置响应头，支持流式输出
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        // 简单的情绪分析函数
        function analyzeEmotion(text) {
            const emotions = {
                happy: /[喜欢|开心|快乐|高兴|棒|好|优秀|感谢|谢谢|满意]/,
                sad: /[伤心|难过|痛苦|失望|不开心|焦虑|担心|害怕]/,
                angry: /[生气|愤怒|不满|讨厌|烦|滚|混蛋|垃圾]/,
                neutral: /.*/ // 默认情绪
            };

            for (const [emotion, pattern] of Object.entries(emotions)) {
                if (pattern.test(text)) {
                    switch(emotion) {
                        case 'happy':
                            return '😊 🌟 ';
                        case 'sad':
                            return '😔 💙 ';
                        case 'angry':
                            return '😤 💪 ';
                        default:
                            return '🤔 💭 ';
                    }
                }
            }
            return '🤔 💭 ';
        }

        // 处理DeepSeek API的流式响应
        const responseText = await response.text();
        const lines = responseText.split('\n');
        
        // 添加表情符号前缀
        const emoticons = analyzeEmotion(userMessage);
        res.write(emoticons); // 首先发送表情符号

        for (const line of lines) {
            if (line.trim() === '') continue;
            if (line.startsWith('data: ')) {
                const jsonData = line.slice(6);
                if (jsonData === '[DONE]') continue;

                try {
                    const parsed = JSON.parse(jsonData);
                    const content = parsed.choices[0]?.delta?.content || '';
                    if (content) {
                        res.write(content);
                    }
                } catch (parseError) {
                    console.error('JSON解析错误:', parseError, '原始数据:', jsonData);
                    continue;
                }
            }
        }

        res.end();

    } catch (error) {
        console.error('服务器错误:', error);
        if (!res.writableEnded) {
            res.status(500).json({
                error: '服务器内部错误',
                message: error.message || '未知错误'
            });
        }
    }
});

// 启动服务器
const startServer = (initialPort) => {
    const server = app.listen(initialPort)
        .on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`端口 ${initialPort} 已被占用，尝试使用端口 ${initialPort + 1}`);
                startServer(initialPort + 1);
            } else {
                console.error('服务器启动错误:', err);
            }
        })
        .on('listening', () => {
            const addr = server.address();
            console.log(`服务器运行在 http://localhost:${addr.port}`);
        });
};

startServer(port);