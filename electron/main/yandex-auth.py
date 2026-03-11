#!/usr/bin/env python3
"""
Yandex Music Token Generator for KumaFlow
Получение x_token по логину и паролю через Yandex Passport API
"""

import asyncio
import aiohttp
import sys
import json


class YandexAuth:
    """Класс для авторизации в Яндексе и получения x_token"""
    
    def __init__(self):
        self.session = None
        self.cookies = None
        self.csrf_token = None
        self.track_id = None
        
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def get_csrf_token(self):
        """Получение CSRF токена"""
        async with self.session.get('https://passport.yandex.ru/am?app_platform=android') as resp:
            html = await resp.text()
            import re
            match = re.search(r'"csrf_token" value="([^"]+)"', html)
            if match:
                self.csrf_token = match.group(1)
                return True
        return False
    
    async def submit_password(self, login, password):
        """Отправка логина и пароля"""
        # Шаг 1: Получаем track_id
        async with self.session.post(
            'https://passport.yandex.ru/registration-validations/auth/password/submit',
            data={
                'csrf_token': self.csrf_token,
                'retpath': 'https://passport.yandex.ru/profile',
                'with_code': 1,
            }
        ) as resp:
            result = await resp.json()
            if result.get('status') != 'ok':
                return {'error': result.get('errors', ['Unknown error'])[0]}
            
            self.track_id = result.get('track_id')
        
        # Шаг 2: Отправляем пароль
        async with self.session.post(
            'https://passport.yandex.ru/registration-validations/auth/multi_step/commit_password',
            data={
                'csrf_token': self.csrf_token,
                'track_id': self.track_id,
                'password': password,
                'retpath': 'https://passport.yandex.ru/am/finish?status=ok&from=Login',
            }
        ) as resp:
            result = await resp.json()
            if result.get('status') != 'ok':
                return {'error': result.get('errors', ['Unknown error'])[0]}
        
        return {'success': True}
    
    async def get_x_token(self):
        """Получение x_token из cookies"""
        # Собираем cookies
        cookies = []
        for cookie in self.session.cookie_jar:
            if 'yandex.ru' in cookie.domain:
                cookies.append(f"{cookie.key}={cookie.value}")
        
        cookies_str = "; ".join(cookies)
        
        # Получаем x_token
        async with self.session.post(
            'https://mobileproxy.passport.yandex.net/1/bundle/oauth/token_by_sessionid',
            data={
                'client_id': 'c0ebe342af7d48fbbbfcf2d2eedb8f9e',
                'client_secret': 'ad0a908f0aa341a182a37ecd75bc319e',
            },
            headers={
                'Ya-Client-Cookie': cookies_str,
                'Ya-Client-Host': 'passport.yandex.ru',
            }
        ) as resp:
            result = await resp.json()
            if 'access_token' in result:
                return {'x_token': result['access_token']}
            else:
                return {'error': result.get('errors', ['Failed to get token'])[0]}
    
    async def validate_token(self, x_token):
        """Проверка токена"""
        async with self.session.get(
            'https://mobileproxy.passport.yandex.net/1/bundle/account/short_info/?avatar_size=islands-300',
            headers={'Authorization': f'OAuth {x_token}'}
        ) as resp:
            result = await resp.json()
            if result.get('display_login'):
                return {
                    'valid': True,
                    'login': result.get('display_login'),
                    'name': result.get('display_name', ''),
                }
            return {'valid': False}


async def main():
    """Основная функция"""
    if len(sys.argv) < 3:
        print(json.dumps({'error': 'Login and password required'}))
        sys.exit(1)
    
    login = sys.argv[1]
    password = sys.argv[2]
    
    try:
        async with YandexAuth() as auth:
            # Получаем CSRF токен
            if not await auth.get_csrf_token():
                print(json.dumps({'error': 'Failed to get CSRF token'}))
                sys.exit(1)
            
            # Отправляем логин и пароль
            result = await auth.submit_password(login, password)
            if 'error' in result:
                print(json.dumps(result))
                sys.exit(1)
            
            # Получаем x_token
            token_result = await auth.get_x_token()
            if 'error' in token_result:
                print(json.dumps(token_result))
                sys.exit(1)
            
            x_token = token_result['x_token']
            
            # Проверяем токен
            validate_result = await auth.validate_token(x_token)
            if not validate_result.get('valid'):
                print(json.dumps({'error': 'Token validation failed'}))
                sys.exit(1)
            
            # Возвращаем результат
            print(json.dumps({
                'success': True,
                'x_token': x_token,
                'login': validate_result['login'],
                'name': validate_result['name'],
            }))
            
    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)


if __name__ == '__main__':
    asyncio.run(main())
