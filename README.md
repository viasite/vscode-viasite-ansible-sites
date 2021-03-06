# ansible-server-sites

Operations with sites deployed with viasite-ansible/ansible-server

You can use it for quick operations with sites from sites.json (see example at page botom).

## Features

- Git clone site
- SSH to site
- PuTTY to site
- WinSCP to site
- Generate xdebug config
- Generate Deploy Reloaded config
- Add site to winscp.ini

### Git clone site

You should define you projects root directory (in my case `~/projects/site`),
then projects will be searched at this place.

### Generate configs

- store link to site in `.vscode/.ansible-site`
- show config for remote debug site
- write config for remote site in winscp.ini
- write xdebug config to `.vscode/launch.json`
- write Deploy Reloaded config to `.vscode/settings.json`

For Winscp.ini write you should store your WinSCP settings in INI file.
To do this, open Options - Preferences - Storage, and set Configuration storage as "Automatic INI file" or "Custom INI file".
In case Configuration Storage as "Custom INI file", open VSCode settings, and define setting "ansible-server-sites.winscp_ini_path"

## Extension Settings

- `ansible-server-sites.json_url` - URL to your generated JSON with site list
- `ansible-server-sites.json_cache_time` - cache time JSON data, in seconds
- `ansible-server-sites.winscp_ini_path` - path to your WinSCP.ini file
- `ansible-server-sites.putty_path` - path to putty.exe (or place putty.exe to %PATH%)

## sites.json example

```json
{
  "sites": [
    {
      "domain": "example.com",
      "group": "sites group 1",
      "ssh_command": "ssh example@example.com",
      "site_root": "/home/example/www/example.com",
      "host": "example.com",
      "git_clone_url": "ssh://example@example.com/home/example/www/example.com",
      "user": "example"
    },
    {
        ...other sites
    }
  ]
}
```
