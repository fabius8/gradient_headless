import subprocess
import datetime
import time

def check_user_status(user_id, max_retries=4):
    """
    Check user status with retry mechanism
    
    Args:
        user_id (int): User ID to check
        max_retries (int): Maximum number of retry attempts
    
    Returns:
        tuple: (user_id, result, timestamp)
    """
    def run_check_command(retry_num=0):
        try:
            # 构造命令，注意替换为你实际的检查脚本
            command = ['node', 'checkStatus.js', str(user_id)]
            
            # 运行命令并捕获输出
            result = subprocess.run(
                command, 
                capture_output=True, 
                text=True, 
                timeout=10  # 设置超时
            )
            
            # 成功执行
            if result.returncode == 0:
                output = result.stdout.strip()
                return output
            
            # 失败情况
            raise subprocess.CalledProcessError(result.returncode, command)
        
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
            # 重试机制
            if retry_num < max_retries:
                print(f"Retry {retry_num + 1} for user {user_id}")
                time.sleep(2 ** retry_num)  # 指数退避
                return run_check_command(retry_num + 1)
            else:
                return f"Failed to connect on port after {max_retries} attempts"
    
    # 获取执行时间戳
    timestamp = datetime.datetime.now().strftime("%m%d %H:%M:%S.%f")[:15]
    result = run_check_command()
    
    return (user_id, result, timestamp)

def main():
    # 读取起始和结束用户ID
    start_user = int(input("Enter start user ID: "))
    end_user = int(input("Enter end user ID: "))
    
    # 顺序处理所有用户
    for user_id in range(start_user, end_user + 1):
        user_id, result, timestamp = check_user_status(user_id - 1 + 11500)
        print(f"{timestamp} {user_id}: {result}")

if __name__ == "__main__":
    main()