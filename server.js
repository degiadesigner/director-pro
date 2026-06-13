const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
// Mở cửa cho thư mục chứa giao diện
app.use(express.static(path.join(__dirname, 'public')));
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

const app = express();

// =================== CẤU HÌNH MẠNG VÀ BẢO MẬT (PHẢI THEO ĐÚNG THỨ TỰ NÀY) ===================
// 1. Mở cửa khẩu cho mọi trình duyệt
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'DELETE', 'UPDATE', 'PUT', 'PATCH'] }));
// 2. Kính lúp đọc hiểu dữ liệu JSON (RẤT QUAN TRỌNG)
app.use(express.json());
// 3. Cho phép đọc file tĩnh (Giao diện Web)
app.use(express.static(__dirname)); 


// =================== 1. HỆ THỐNG DATABASE TÀI KHOẢN (LƯU LẠI CHUẨN CŨ) ===================
const USERS_FILE = path.join(__dirname, 'users.json');
if (!fs.existsSync(USERS_FILE)) {
    const defaultUsers = { "admin": { pass: "123456", name: "MinhTT (Boss)", icon: "👑", role: "admin" } };
    fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 4));
}
const getUsers = () => JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
const saveUsers = (data) => fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 4));

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const users = getUsers();
    if (users[username] && users[username].pass === password) {
        res.json({ success: true, user: { username, ...users[username] } });
    } else {
        res.json({ success: false, message: "Sai tài khoản/mật khẩu!" });
    }
});

app.get('/api/users', (req, res) => res.json({ success: true, data: getUsers() }));

app.post('/api/users', (req, res) => {
    const { newUsername, newPass, newName, role } = req.body;
    const users = getUsers();
    if (users[newUsername]) return res.json({ success: false, message: "Trùng ID!" });
    users[newUsername] = { pass: newPass, name: newName, icon: role === 'admin' ? "🛡️" : "👤", role: role };
    saveUsers(users); 
    res.json({ success: true, message: "Tạo thành công!" });
});

app.delete('/api/users/:username', (req, res) => {
    const users = getUsers();
    if (req.params.username === 'admin') return res.json({ success: false, message: "Không xóa được Boss!" });
    delete users[req.params.username]; 
    saveUsers(users); 
    res.json({ success: true });
});

// =================== 2. ĐỘNG CƠ AI GEMINI ===================
const API_KEY = "AIzaSyCHCrogYSqxVFf80LwuZh8VedaV1fuiK_I"; 
const genAI = new GoogleGenerativeAI(API_KEY);

const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
    safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
    ]
});
// =================== ĐỘNG CƠ TỐI ƯU LÁCH LUẬT AI (ĐÃ NÂNG CẤP) ===================
app.post('/api/optimize-prompt', async (req, res) => {
    try {
        const { topic, tones } = req.body;
        
        const optimizePrompt = `
        Bạn là Đạo diễn kịch bản Viral TikTok thực chiến. Nhiệm vụ: Viết lại ý tưởng dưới đây thành 1 Lệnh (Prompt) NGẮN GỌN (dưới 80 chữ) để chỉ đạo AI khác viết kịch bản.
        
        Ý tưởng gốc: "${topic}"
        Tone/Phong cách người dùng chọn: ${tones}

        LUẬT BẮT BUỘC (NẾU VI PHẠM SẼ BỊ XÓA BỎ):
        1. SIÊU NGẮN GỌN: Đi thẳng vào kịch bản, bối cảnh, nhân vật. Tuyệt đối KHÔNG viết thêm các câu đạo lý như "ngôn ngữ phù hợp", "tính giáo dục cao", "không miêu tả nguy hiểm"... (Tôi đã lo phần an toàn, bạn không cần nhắc lại).
        2. ÉP BUỘC TÍNH HÀI HƯỚC/CHÂM BIẾM: Nếu người dùng chọn Hài hước, bạn PHẢI đưa ra concept buồn cười. Áp dụng "Hài tình huống" (Nghiệp quật, làm lố sự chủ quan ngớ ngẩn của nhân vật, đồ vật phản chủ...). Vui nhộn, giải trí là ưu tiên số 1 để giữ chân khán giả, thông điệp sẽ được chèn khéo léo vào giây cuối cùng.
        3. KỊCH TÍNH: Thêm cú twist bất ngờ ở cuối.
        4. Trả về đúng 1 đoạn văn bản chỉ đạo. Không giải thích lăng nhăng.
        `;

        const result = await model.generateContent(optimizePrompt);
        let optimizedText = result.response.text().trim();

        res.json({ success: true, data: optimizedText });
    } catch (error) {
        console.error("Lỗi động cơ tối ưu:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});
// =================================================================
// =================================================================
app.post('/api/generate-scripts', async (req, res) => {
    try {
        const { topic, count, tones, format } = req.body;
        
        let selectedTones = Array.isArray(tones) && tones.length > 0 ? tones : ["Chuyên nghiệp cơ bản"];
        const toneString = selectedTones.join(" KẾT HỢP VỚI ");

        const masterPrompt = `
        Bạn là Đạo Diễn Tiên Phong. Yêu cầu viết ${count} kịch bản.
        Chủ đề/Ý tưởng gốc: ${topic}.
        Định dạng: ${format}.
        Phong cách (Mix Tone): ${toneString}.

        LUẬT ĐA DẠNG HÓA KỊCH BẢN (TỐI QUAN TRỌNG):
        - Vì tôi yêu cầu ${count} kịch bản, nên MỖI KỊCH BẢN PHẢI LÀ MỘT CONCEPT HOÀN TOÀN ĐỘC LẬP VÀ KHÁC BIỆT.
        - Tuyệt đối không xào nấu, lặp lại cốt truyện, nhân vật hay góc nhìn. 
        - Ví dụ: Nếu kịch bản 1 kể theo góc nhìn nạn nhân, thì kịch bản 2 phải kể theo góc nhìn của người qua đường/đồ vật, kịch bản 3 kể theo dạng phỏng vấn/tài liệu... Hãy sáng tạo tối đa!

        BẮT BUỘC TRẢ VỀ CHUẨN JSON SAU (Dạng Mảng Array gồm ${count} Object):
        [
            {
                "script_meta": {
                    "title": "Tên phim/Video (Khác biệt)",
                    "concept": "Tên Concept Mix",
                    "full_story_summary": "Tóm tắt cốt truyện"
                },
                "story_stages": [
                    { "stage_name": "Giai đoạn 1", "description": "Mô tả" }
                ],
                "storyboard": [
                    { "scene_number": "1", "camera_lighting": "Góc máy", "visual_action": "Hành động", "audio_dialogue": "Thoại", "duration_seconds": "3" }
                ]
            }
        ]
        `;

        const result = await model.generateContent(masterPrompt);
        let responseText = result.response.text();
        
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            responseText = jsonMatch[0];
        } else {
            responseText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        }

        res.json({ success: true, data: JSON.parse(responseText) });
    } catch (error) {
        console.error("LỖI AI:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🔥 Director.AI V9 đã sẵn sàng tại http://localhost:${PORT}`));