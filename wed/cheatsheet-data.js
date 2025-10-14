// File contents for the Morse Code Project Cheatsheet

const fileContents = {
    'receiver-py': {
        name: 'receiver.py',
        type: 'text/x-python; charset=utf-8',
        code: `# -*- coding: utf-8 -*-
import socket
import time
import requests

# 設定伺服器參數
HOST = '0.0.0.0'
PORT = 8080

# 摩斯密碼處理相關參數
BUTTON_PRESSED = False
PRESS_TIME = None
RELEASE_TIME = None
MORSE_BUFFER = []
MAX_MORSE_LENGTH = 6

# 請定義完整的摩斯密碼轉換表
morse_dict = {
    ".-": "A",
    "-...": "B",
    "-.-.": "C",
    "-..": "D",
    ".": "E",
    "..-.": "F",
    "--.": "G",
    "....": "H",
    "..": "I",
    ".---": "J",
    "-.-": "K",
    ".-..": "L",
    "--": "M",
    "-.": "N",
    "---": "O",
    ".--.": "P",
    "--.-": "Q",
    ".-.": "R",
    "...": "S",
    "-": "T",
    "..-": "U",
    "...-": "V",
    ".--": "W",
    "-..-": "X",
    "-.--": "Y",
    "--..": "Z",
    ".----": "1",
    "..---": "2",
    "...--": "3",
    "....-": "4",
    ".....": "5",
    "-....": "6",
    "--...": "7",
    "---..": "8",
    "----.": "9",
    "-----": "0"
}

def clear_morse():
    """清空摩斯密碼緩衝區"""
    global MORSE_BUFFER
    MORSE_BUFFER = []

def parse_morse_code(morse_buffer):
    """解析摩斯密碼"""
    morse_str = ''.join(morse_buffer)
    
    return morse_dict.get(morse_str, 'Invalid Morse code sequence.')

def is_current_morse_code_possiable(morse_buffer):
    morse_str = ''.join(morse_buffer)
    possible_keys = [key for key in morse_dict.keys() if key.startswith(morse_str)]

    return len(possible_keys) == 0

def handle_button_event(state):
    """處理按鈕事件"""
    global BUTTON_PRESSED, PRESS_TIME, RELEASE_TIME, MORSE_BUFFER

    if state == '1' and not BUTTON_PRESSED:  # 按鈕被按下
        BUTTON_PRESSED = True
        PRESS_TIME = time.time()
    elif state == '0' and BUTTON_PRESSED:  # 按鈕被釋放
        BUTTON_PRESSED = False
        RELEASE_TIME = time.time()

        # 計算按下的持續時間
        duration = (RELEASE_TIME - PRESS_TIME) * 1000  # 轉換為毫秒
        if duration < 200:
            MORSE_BUFFER.append('.')
        else:
            MORSE_BUFFER.append('-')
            
        if len(MORSE_BUFFER) < 5:
            if is_current_morse_code_possiable(MORSE_BUFFER) == 'Invalid Morse code sequence.':
                check_morse_idle(True)
            else:
                payload = {'morse_code': ''.join(MORSE_BUFFER), 'morse_decode': 'Loading...', 'create_new_row': len(MORSE_BUFFER) == 1}
                response = requests.post('http://localhost:5000/morse', json=payload)
                response.raise_for_status()
        else:
            check_morse_idle(True)

def check_morse_idle(force=False):
    """檢查是否有長時間無輸入並處理摩斯密碼"""
    global RELEASE_TIME, BUTTON_PRESSED, MORSE_BUFFER

    if force or RELEASE_TIME:
        idle_duration = (time.time() - RELEASE_TIME) * 1000
        if force or (not BUTTON_PRESSED and idle_duration > 500 and MORSE_BUFFER):
            result = parse_morse_code(MORSE_BUFFER)
            payload = {'morse_code': ''.join(MORSE_BUFFER), 'morse_decode': result, 'create_new_row': False}
            try:
                response = requests.post('http://localhost:5000/morse', json=payload)
                response.raise_for_status()
            except requests.exceptions.RequestException as e:
                print(f"Failed to send POST request: {e}")
            clear_morse()


def start_server():
    """啟動Socket伺服器（非阻塞模式）"""
    with socket.socket(socket.AF_INET, SOCK_STREAM) as server_socket:
        server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)  # 允許地址重用
        server_socket.bind((HOST, PORT))
        server_socket.listen(1)
        print(f"Server listening on {HOST}:{PORT}...")

        while True:  # 主循環，允許伺服器在客戶端斷線後重新等待
            print("Waiting for a new connection...")
            conn, addr = server_socket.accept()
            conn.setblocking(False)  # 設定為非阻塞模式
            print(f"Connection established with {addr}.")

            try:
                while True:  # 客戶端連接處理循環
                    try:
                        data = conn.recv(2)
                        if not data:  # 檢查連接是否已關閉
                            print("Connection closed by client.")
                            break

                        state = data.decode().strip().rstrip('\\x00')  # 去除尾部多餘字元
                        if state in {'0', '1'}:
                            handle_button_event(state)  # 處理按鈕事件
                        else:
                            print(f"Unexpected data received: {state}")
                    except BlockingIOError:
                        # 如果沒有資料可讀，這裡不阻塞，繼續執行其他操作
                        check_morse_idle()  # 檢查摩斯密碼的閒置時間處理
                        time.sleep(0.1)  # 避免無限快速循環浪費CPU
                    except Exception as e:
                        print(f"An error occurred while handling client: {e}")
                        break
            except KeyboardInterrupt:
                print("\\nServer shutting down.")
                break
            except Exception as e:
                print(f"An error occurred in the connection loop: {e}")
            finally:
                conn.close()  # 確保連接被正確關閉


def main():
    try:
        start_server()
    except KeyboardInterrupt:
        print("\\nServer shutting down.")
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    main()
`
    },
    'receiver-sos': {
        name: 'receiver_with_sos.cpp',
        type: 'text/x-c++src; charset=utf-8',
        code: `#include <iostream>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <cstring>
#include <fcntl.h>
#include <chrono>
#include <string>

using namespace std;
using namespace std::chrono;

const int port = 8080;

void clear(char moss[], int arr_size) {
    for (int i = 0; i < arr_size; i++) {
        moss[i] = '\\0';
    }
}

char checkMorse(char moss[]) {
    if (strcmp(moss, ".-") == 0) return 'A';
    else if (strcmp(moss, "-...") == 0) return 'B';
    else if (strcmp(moss, "-.-.") == 0) return 'C';
    else if (strcmp(moss, "-..") == 0) return 'D';
    else if (strcmp(moss, ".") == 0) return 'E';
    else if (strcmp(moss, "..-.") == 0) return 'F';
    else if (strcmp(moss, "--.") == 0) return 'G';
    else if (strcmp(moss, "....") == 0) return 'H';
    else if (strcmp(moss, "..") == 0) return 'I';
    else if (strcmp(moss, ".---") == 0) return 'J';
    else if (strcmp(moss, "-.-") == 0) return 'K';
    else if (strcmp(moss, ".-..") == 0) return 'L';
    else if (strcmp(moss, "--") == 0) return 'M';
    else if (strcmp(moss, "-.") == 0) return 'N';
    else if (strcmp(moss, "---") == 0) return 'O';
    else if (strcmp(moss, ".--.") == 0) return 'P';
    else if (strcmp(moss, "--.-") == 0) return 'Q';
    else if (strcmp(moss, ".-.") == 0) return 'R';
    else if (strcmp(moss, "...") == 0) return 'S';
    else if (strcmp(moss, "-") == 0) return 'T';
    else if (strcmp(moss, "..-") == 0) return 'U';
    else if (strcmp(moss, "...-") == 0) return 'V';
    else if (strcmp(moss, ".--") == 0) return 'W';
    else if (strcmp(moss, "-..-") == 0) return 'X';
    else if (strcmp(moss, "-.--") == 0) return 'Y';
    else if (strcmp(moss, "--..") == 0) return 'Z';
    else if (strcmp(moss, ".----") == 0) return '1';
    else if (strcmp(moss, "..---") == 0) return '2';
    else if (strcmp(moss, "...--") == 0) return '3';
    else if (strcmp(moss, "....-") == 0) return '4';
    else if (strcmp(moss, ".....") == 0) return '5';
    else if (strcmp(moss, "-....") == 0) return '6';
    else if (strcmp(moss, "--...") == 0) return '7';
    else if (strcmp(moss, "---..") == 0) return '8';
    else if (strcmp(moss, "----.") == 0) return '9';
    else if (strcmp(moss, "-----") == 0) return '0';
    else return '\\0';
}

int main() {
    int server_fd, new_socket;
    struct sockaddr_in address;
    int opt = 1;
    int addrlen = sizeof(address);
    char buffer[10] = {0};

    if ((server_fd = socket(AF_INET, SOCK_STREAM, 0)) == 0) {
        printf("\\033[1;31mSocket failed.\\033[0m\\n");
        fflush(stdout);
        exit(1);
    }

    if (setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR | SO_REUSEPORT, &opt, sizeof(opt))) {
        printf("\\033[1;31msetsockopt failed.\\033[0m\\n");
        fflush(stdout);
        exit(1);
    }
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = INADDR_ANY;
    address.sin_port = htons(port);

    if (bind(server_fd, (struct sockaddr *)&address, sizeof(address)) < 0) {
        printf("\\033[1;31mBind failed.\\033[0m\\n");
        fflush(stdout);
        exit(1);
    }

    if (listen(server_fd, 3) < 0) {
        printf("\\033[1;31mListen failed.\\033[0m\\n");
        fflush(stdout);
        exit(1);
    }

    cout << "Waiting for connection...\\n";
    if ((new_socket = accept(server_fd, (struct sockaddr *)&address, (socklen_t *)&addrlen)) < 0) {
        printf("\\033[1;31mAccept failed.\\033[0m\\n");
        fflush(stdout);
        exit(1);
    }

    fcntl(new_socket, F_SETFL, O_NONBLOCK);

    printf("\\033[1;32mConnection established.\\033[0m\\n");

    bool buttonPressed = false;
    time_point<system_clock> pressTime, releaseTime;
    int arr_size = 6, count = 0;
    char moss[arr_size] = {'\\0'};
    char ans = '\\0';
    
    // SOS detection
    string decodedMessage = "";
    
    while (1) {
        int valread = read(new_socket, buffer, sizeof(buffer));
        if (valread > 0) {
            if (buffer[0] == '1' && !buttonPressed) {
                buttonPressed = true;
                pressTime = system_clock::now();
            } else if (buffer[0] == '0' && buttonPressed) {
                buttonPressed = false;
                releaseTime = system_clock::now();

                auto duration = duration_cast<milliseconds>(releaseTime - pressTime).count();

                if (duration < 200) {
                    moss[count] = '.';
                    printf("\\033[1;33m.\\033[0m");  // 黃色點
                    count++;
                } else {
                    moss[count] = '-';
                    printf("\\033[1;33m-\\033[0m");  // 黃色劃
                    count++;
                }
                fflush(stdout);
            }
        }

        auto currentTime = system_clock::now();
        auto idleDuration = duration_cast<milliseconds>(currentTime - releaseTime).count();
        
        if (!buttonPressed && idleDuration > 500 && count > 0) {
            ans = checkMorse(moss);
            if (ans != '\\0') {
                printf("\\033[1;32m -> %c\\033[0m\\n", ans);  // 綠色結果
                decodedMessage += ans;
                
                // Check for SOS (last 3 characters)
                if (decodedMessage.length() >= 3) {
                    string last3 = decodedMessage.substr(decodedMessage.length() - 3);
                    if (last3 == "SOS") {
                        printf("\\033[1;31m\\n🚨 SOS DETECTED! Triggering LED alert... 🚨\\033[0m\\n");
                        // Send SOS signal back to sender
                        char sosSignal[] = "SOS";
                        send(new_socket, sosSignal, strlen(sosSignal), 0);
                        fflush(stdout);
                    }
                }
            } else {
                printf("\\033[1;31m\\nInvalid Morse code sequence.\\033[0m\\n");
            }
            fflush(stdout);
            clear(moss, arr_size);
            count = 0;
        }

        // Word separation
        if (!buttonPressed && idleDuration > 1500 && decodedMessage.length() > 0) {
            printf(" ");
            decodedMessage += " ";
            fflush(stdout);
        }
    }

    close(new_socket);
    close(server_fd);
    return 0;
}
`
    },
    'sender-sos': {
        name: 'sender_with_sos.cpp',
        type: 'text/x-c++src; charset=utf-8',
        code: `#include <iostream>
#include <wiringPi.h>
#include <sys/socket.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <chrono>
#include <stdio.h>
#include <cstring>
#include <fcntl.h>

using namespace std;
using namespace std::chrono;

const int led = 1;     // GPIO1
const int onoff = 4;   // GPIO4
const char *receiverIP = "127.0.0.1";
const int receiverPort = 8080;

int sock = 0;

void setupSocket() {
    struct sockaddr_in serv_addr;
    sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) {
        cerr << "Socket creation error\\n";
        exit(1);
    }

    serv_addr.sin_family = AF_INET;
    serv_addr.sin_port = htons(receiverPort);

    if (inet_pton(AF_INET, receiverIP, &serv_addr.sin_addr) <= 0) {
        cerr << "Invalid address/ Address not supported \\n";
        exit(1);
    }

    if (connect(sock, (struct sockaddr *)&serv_addr, sizeof(serv_addr)) < 0) {
        cerr << "Connection Failed\\n";
        exit(1);
    }
    
    // Set socket to non-blocking mode to receive SOS signals
    fcntl(sock, F_SETFL, O_NONBLOCK);
}

void sendButtonState(int state) {
    char buffer[2];
    buffer[0] = state ? '1' : '0';
    buffer[1] = '\\0';
    send(sock, buffer, sizeof(buffer), 0);
}

void flashSOSPattern() {
    cout << "\\033[1;31m🚨 SOS! Flashing emergency pattern... 🚨\\033[0m\\n";
    
    // SOS pattern: ... --- ...
    // S (3 short flashes)
    for (int i = 0; i < 3; i++) {
        digitalWrite(led, 1);
        delay(200);
        digitalWrite(led, 0);
        delay(200);
    }
    
    delay(400); // Gap between letters
    
    // O (3 long flashes)
    for (int i = 0; i < 3; i++) {
        digitalWrite(led, 1);
        delay(600);
        digitalWrite(led, 0);
        delay(200);
    }
    
    delay(400); // Gap between letters
    
    // S (3 short flashes)
    for (int i = 0; i < 3; i++) {
        digitalWrite(led, 1);
        delay(200);
        digitalWrite(led, 0);
        delay(200);
    }
    
    delay(1000); // Pause before repeating
    
    cout << "\\033[1;32mSOS pattern complete.\\033[0m\\n";
}

int main() {
    if (wiringPiSetup() == -1) {
        cerr << "Failed to setup WiringPi.\\n";
        return 0;
    }

    pinMode(led, OUTPUT);
    pinMode(onoff, INPUT);

    setupSocket();

    int prevState = -1;
    char sosBuffer[10] = {0};

    while (1) {
        // Check for SOS signal from receiver
        int valread = read(sock, sosBuffer, sizeof(sosBuffer));
        if (valread > 0) {
            if (strncmp(sosBuffer, "SOS", 3) == 0) {
                flashSOSPattern();
                memset(sosBuffer, 0, sizeof(sosBuffer));
            }
        }

        // Normal button handling
        int currentState = digitalRead(onoff);

        if (currentState != prevState) {
            if (currentState == 1) {
                digitalWrite(led, 1);
                sendButtonState(1);
            } else {
                digitalWrite(led, 0);
                sendButtonState(0);
            }
            prevState = currentState;
        }
        delay(50);
    }

    close(sock);
    return 0;
}
`
    },
    'sender': {
        name: 'sender.cpp',
        type: 'text/x-c++src; charset=utf-8',
        code: `#include <iostream>
#include <wiringPi.h>
#include <sys/socket.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <chrono>
#include <stdio.h>

using namespace std;
using namespace std::chrono;

const int led = 1;     // GPIO1
const int onoff = 4;   // GPIO4
const char *receiverIP = "127.0.0.1"; // 接收端的 IP 地址
const int receiverPort = 8080;        // 接收端的 Port

int sock = 0;

void setupSocket() {
    struct sockaddr_in serv_addr;
    sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) {
        cerr << "Socket creation error\\n";
        exit(1);
    }

    serv_addr.sin_family = AF_INET;
    serv_addr.sin_port = htons(receiverPort);

    // 轉換 IP 地址格式
    if (inet_pton(AF_INET, receiverIP, &serv_addr.sin_addr) <= 0) {
        cerr << "Invalid address/ Address not supported \\n";
        exit(1);
    }

    if (connect(sock, (struct sockaddr *)&serv_addr, sizeof(serv_addr)) < 0) {
        cerr << "Connection Failed\\n";
        exit(1);
    }
}

void sendButtonState(int state) {
    char buffer[2];
    buffer[0] = state ? '1' : '0';
    buffer[1] = '\\0';
    send(sock, buffer, sizeof(buffer), 0);
}

int main() {
    if (wiringPiSetup() == -1) {
        cerr << "Failed to setup WiringPi.\\n";
        return 0;
    }

    pinMode(led, OUTPUT);
    pinMode(onoff, INPUT);

    setupSocket(); // 初始化 Socket 連接

    int prevState = -1;
    steady_clock::time_point pressTime, releaseTime;

    while (1) {
        int currentState = digitalRead(onoff);

        if (currentState != prevState) {
            if (currentState == 1) {
                digitalWrite(led, 1);   // LED 亮
                sendButtonState(1);     // 傳送按下狀態
            } else {
                digitalWrite(led, 0);   // LED 滅
                sendButtonState(0);     // 傳送放開狀態
            }
            prevState = currentState;
        }
        delay(50);
    }

    close(sock); // 關閉 Socket 連接
    return 0;
}
`
    }
};

let currentFile = 'receiver-py';

document.addEventListener('DOMContentLoaded', () => {
    const codeContentEl = document.getElementById('code-content');
    const copyBtn = document.getElementById('copy-btn');
    const copyTextEl = document.getElementById('copy-text');
    const downloadBtn = document.getElementById('download-btn');
    const fileTitleEl = document.getElementById('file-title');
    const fileSelectEl = document.getElementById('file-select');
    const fileSelectorEl = document.getElementById('file-selector');
    
    // Tab switching elements
    const tabCodeBtn = document.getElementById('tab-code');
    const tabCommandsBtn = document.getElementById('tab-commands');
    const codeContentSection = document.getElementById('code-content-section');
    const commandsContentSection = document.getElementById('commands-content-section');
    const codeActions = document.getElementById('code-actions');

    // Load initial file
    function loadFile(fileKey) {
        const file = fileContents[fileKey];
        codeContentEl.textContent = file.code;
        fileTitleEl.textContent = file.name;
        currentFile = fileKey;
    }

    loadFile(currentFile);

    // File selector change
    fileSelectEl.addEventListener('change', (e) => {
        loadFile(e.target.value);
    });

    // --- Tab Switching Logic ---
    tabCodeBtn.addEventListener('click', () => {
        tabCodeBtn.classList.add('active');
        tabCommandsBtn.classList.remove('active');
        codeContentSection.classList.add('active');
        commandsContentSection.classList.remove('active');
        codeActions.style.display = 'flex';
        fileSelectorEl.style.display = 'block';
    });

    tabCommandsBtn.addEventListener('click', () => {
        tabCommandsBtn.classList.add('active');
        tabCodeBtn.classList.remove('active');
        commandsContentSection.classList.add('active');
        codeContentSection.classList.remove('active');
        codeActions.style.display = 'none';
        fileSelectorEl.style.display = 'none';
    });

    // --- Copy Command Button Logic ---
    const copyCommandBtns = document.querySelectorAll('.copy-command-btn');
    copyCommandBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const command = btn.getAttribute('data-command');
            
            try {
                await navigator.clipboard.writeText(command);
                const originalHTML = btn.innerHTML;
                btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: #6750a4;"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"></path></svg>';
                setTimeout(() => {
                    btn.innerHTML = originalHTML;
                }, 1500);
            } catch (err) {
                const tempTextarea = document.createElement('textarea');
                tempTextarea.value = command;
                tempTextarea.style.position = 'fixed';
                tempTextarea.style.left = '-9999px';
                tempTextarea.style.opacity = '0';
                document.body.appendChild(tempTextarea);
                tempTextarea.select();
                document.execCommand('copy');
                document.body.removeChild(tempTextarea);
                
                const originalHTML = btn.innerHTML;
                btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: #6750a4;"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"></path></svg>';
                setTimeout(() => {
                    btn.innerHTML = originalHTML;
                }, 1500);
            }
        });
    });

    // --- Copy Button Logic ---
    copyBtn.addEventListener('click', async () => {
        const textToCopy = codeContentEl.innerText;
        
        try {
            await navigator.clipboard.writeText(textToCopy);
            copyTextEl.textContent = 'Copied!';
            setTimeout(() => {
                copyTextEl.textContent = 'Copy';
            }, 2000);
        } catch (err) {
            const tempTextarea = document.createElement('textarea');
            tempTextarea.value = textToCopy;
            tempTextarea.style.position = 'fixed';
            tempTextarea.style.left = '-9999px';
            tempTextarea.style.opacity = '0';
            document.body.appendChild(tempTextarea);
            tempTextarea.select();
            document.execCommand('copy');
            document.body.removeChild(tempTextarea);
            
            copyTextEl.textContent = 'Copied!';
            setTimeout(() => {
                copyTextEl.textContent = 'Copy';
            }, 2000);
        }
    });

    // --- Download Button Logic ---
    downloadBtn.addEventListener('click', () => {
        const file = fileContents[currentFile];
        const blob = new Blob([file.code], { type: file.type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
});
