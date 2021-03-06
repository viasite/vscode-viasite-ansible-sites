'use strict';

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const punycode = require('punycode');
const exec = require('child_process').exec;
const sitesCache = {
  time: 0,
  sites: []
};

exports.activate = context => {
  const commands = {
    'site-ssh': commandSiteSSH,
    'ssh-tunnel': commandSSHTunnel,
    winscp: commandSiteWinSCP,
    'site-putty': commandSitePuTTY,
    'site-clone': commandGitClone,
    'site-configs': commandSiteConfigs
  };

  const subscriptions = Object.entries(commands).map(tuple => {
    return vscode.commands.registerCommand(
      'ansible-server-sites.' + tuple[0],
      proxySiteCommand(tuple[1])
    );
  });

  for (let i = 0; i < subscriptions.length; i++) {
    context.subscriptions.push(subscriptions[i]);
  }
};

exports.deactivate = () => {};

// proxy site command, select site, then call command
const proxySiteCommand = (command, site = null) => {
  return async function() {
    // from .ansible-site file
    if (!site) {
      const cacheJsonPath = vscode.workspace.rootPath + '/.ansible-site';
      if (fs.existsSync(cacheJsonPath)) {
        const jsonRaw = fs.readFileSync(cacheJsonPath).toString();
        site = JSON.parse(jsonRaw);
      }
    }

    // from select
    if (!site) site = await getSites().then(selectSite);

    // site not defined
    if (!site) return false;
    return command(site);
  };
};

const commandSiteSSH = async site => {
  const terminal = vscode.window.createTerminal(site.domain);
  terminal.sendText(site.ssh_command);
  terminal.show();
};

const commandSSHTunnel = async site => {
  const terminal = vscode.window.createTerminal(site.domain + 'SSH tunnel');
  terminal.sendText(site.ssh_command + ' -R 9000:localhost:9000');
  terminal.show();
};

const commandSiteWinSCP = async site => {
  const config = vscode.workspace.getConfiguration('ansible-server-sites');
  const winscpPath = config.get('winscp_path');
  const userHost = site.user + '@' + site.host;
  exec(`"${winscpPath}" "${userHost}`);
};

const commandSitePuTTY = async site => {
  const config = vscode.workspace.getConfiguration('ansible-server-sites');
  const puttyPath = config.get('putty_path');
  const userHost = site.user + '@' + site.domain;
  exec(`START ${puttyPath} ${userHost}`);
};

const commandGitClone = async site => {
  const url = await vscode.window.showInputBox({
    value: site.git_clone_url,
    prompt: 'Repository URL',
    ignoreFocusOut: true
  });

  const config = vscode.workspace.getConfiguration('git');
  const value = config.get('defaultCloneDirectory') || process.HOMEPATH;
  const parentPath = await vscode.window.showInputBox({
    prompt: 'Parent Directory',
    value,
    ignoreFocusOut: true
  });
  const name = path.basename(site.site_root);
  let clonePath = parentPath + path.sep + name;
  clonePath = clonePath.split('\\').join('/');

  // Open project in new window
  if (fs.existsSync(clonePath)) {
    vscode.window.showInformationMessage(
      name + ' exists at ' + parentPath + ', opening in new window'
    );
    const uri = vscode.Uri.parse('file:///' + clonePath);
    vscode.commands.executeCommand('vscode.openFolder', uri, true);
    return false;
  }

  // clone terminal command
  const terminal = vscode.window.createTerminal();
  const sshCommand = 'git clone ' + url + ' ' + clonePath;
  const openCommand = 'code ' + clonePath;
  terminal.sendText(sshCommand + ' && ' + openCommand);
  terminal.show();

  // wait for project directory appears
  let interval = setInterval(async function() {
    if (fs.existsSync(clonePath)) {
      await commandSiteConfigs(site, clonePath, true);
      clearInterval(interval);
      vscode.window.showInformationMessage('Configs created for ' + clonePath);
    }
  }, 1000);
  // this.git.clone(url, parentPath);
  // try {
  //     vscode.window.withProgress({ location: ProgressLocation.SourceControl, title: "Cloning git repository..." }, () => clonePromise);
  //     vscode.window.withProgress({ location: ProgressLocation.Window, title: "Cloning git repository..." }, () => clonePromise);

  //     const repositoryPath = clonePromise;

  //     const open = "Open Repository";
  //     const result = vscode.window.showInformationMessage("Would you like to open the cloned repository?", open);

  //     const openFolder = result === open;
  //     if (openFolder) {
  //         commands.executeCommand('vscode.openFolder', Uri.file(repositoryPath));
  //     }
  // } catch (err) {
  //     throw err;
  // }
};

const commandSiteConfigs = async (site, projectRoot = null, yesToAll = false) => {
  const settingsPath = projectRoot + '/.vscode';
  if (!fs.existsSync(settingsPath)) fs.mkdirSync(settingsPath);

  const debugData = {
    name: 'Listen for XDebug',
    type: 'php',
    request: 'launch',
    port: 9000,
    serverSourceRoot: site.site_root,
    localSourceRoot: '${workspaceRoot}'
  };

  const sessionName = site.user + '@' + site.host;
  let winscpConfig = '';
  winscpConfig += `[Sessions\\${sessionName}]\n`;
  winscpConfig += `HostName=${site.host}\n`;
  winscpConfig += `UserName=${site.user}\n`;
  winscpConfig += `LocalDirectory=C:\n`;
  winscpConfig += `RemoteDirectory=${site.site_root}`;

  const deployConfig = {
    packages: [
      {
        name: site.domain,
        deployOnSave: true,
        fastCheckOnSave: true,
        targets: ['sftp'],
        files: ['**/*']
      }
    ],
    targets: [
      {
        type: 'sftp',
        name: 'sftp',
        dir: site.site_root,
        host: site.host,
        agent: 'pageant',
        user: site.user,
        password: '...'
      }
    ]
  };

  let msg;

  // .ansible-site
  msg = 'Bind current project to ' + site.domain + '?';
  if (yesToAll || (!fs.existsSync(cacheJsonPath) && (await confirmAction(msg)))) {
    const cacheJsonPath = settingsPath + '/.ansible-site';
    try {
      fs.writeFileSync(cacheJsonPath, JSON.stringify(site, null, '\t'));
    } catch (err) {
      vscode.window.showErrorMessage('Unable to write to ' + cacheJsonPath);
    }
  }

  // deploy reloaded
  msg = 'Write deploy reloaded config to workspace settings?';
  if (yesToAll || (await confirmAction(msg))) {
    const workspaceSettingsPath = settingsPath + '/settings.json';
    try {
      let settings = {};
      if (fs.existsSync(workspaceSettingsPath)) {
        settings = JSON.parse(fs.readFileSync(workspaceSettingsPath));
      }
      settings['deploy.reloaded'] = deployConfig;
      fs.writeFileSync(workspaceSettingsPath, JSON.stringify(settings, null, '\t'));
    } catch (err) {
      vscode.window.showErrorMessage('Unable to write to ' + workspaceSettingsPath);
    }
  }

  // launch.json
  msg = 'Write xdebug configuration to launch.json?';
  if (yesToAll || (await confirmAction(msg))) {
    const launchPath = settingsPath + '/launch.json';
    try {
      let settings = {
        version: '0.2.0',
        configurations: []
      };
      if (fs.existsSync(launchPath)) {
        settings = JSON.parse(fs.readFileSync(launchPath));
      }
      settings.configurations.push(debugData);
      fs.writeFileSync(launchPath, JSON.stringify(settings, null, '\t'));
    } catch (err) {
      vscode.window.showErrorMessage('Unable to write to ' + launchPath);
    }
  }

  // winscp.ini
  msg = 'Write winscp.ini?';
  if (process.platform == 'win32') {
    const config = vscode.workspace.getConfiguration('ansible-server-sites');
    const winscpIniPath = config.get('winscp_ini_path') || process.env.APPDATA + '\\winscp.ini';
    if (fs.existsSync(winscpIniPath)) {
      if (yesToAll || (await confirmAction(msg))) {
        try {
          fs.appendFileSync(winscpIniPath, '\n\n' + winscpConfig);
        } catch (err) {
          vscode.window.showErrorMessage('Unable to write to ' + winscpIniPath);
        }
      }
    } else {
      vscode.window.showErrorMessage(
        winscpIniPath +
          ' not found, open Options - Preferences - Storage - set Configuration storage - Automatic or Custom INI file'
      );
    }
  }
};

const confirmAction = async message => {
  const answer = await vscode.window.showInformationMessage(
    message,
    {
      title: 'Yes',
      id: 'Yes'
    },
    {
      title: 'No',
      id: 'No'
    }
  );
  return answer && answer.id == 'Yes';
};

const selectSite = sites => {
  const options = sites.map(site => {
    return {
      label: punycode.toUnicode(site.domain),
      description: site.host + (site.group ? ' / ' + site.group : '')
    };
  });

  return new Promise((resolve, reject) => {
    const p = vscode.window.showQuickPick(options, { placeHolder: 'domain' });
    p.then(function(val) {
      //console.log('selected: ', val);
      if (val === undefined) {
        return 'Nothing selected';
      }

      const ind = options.indexOf(val);
      const site = sites[ind];
      resolve(site);
    });
  });
};

const getSites = () => {
  const config = vscode.workspace.getConfiguration('ansible-server-sites');
  const cacheTime = config.get('json_cache_time', 300);
  return new Promise((resolve, reject) => {
    // cache
    if (sitesCache.sites.length > 0) {
      const cacheAgeSeconds = (new Date().getTime() - sitesCache.time.getTime()) / 1000;
      // console.log('cache age: ' + cacheAgeSeconds);
      if (cacheAgeSeconds < cacheTime) {
        // console.log('resolve sites from runtime cache');
        resolve(sitesCache.sites);
        return;
      }
    }

    // fetch
    // console.log('resolve sites from url...')
    const url = config.get('json_url');
    fetch(url)
      .then(response => {
        if (response.status != 200) {
          throw new Error('Failed to fetch ' + url + ', status ' + response.status);
        }
        return response.json();
      })
      .then(json => {
        sitesCache.sites = json.sites;
        sitesCache.time = new Date();
        // console.log('store global cache');
        resolve(sitesCache.sites);
      })
      .catch(err => console.error(err));
  });
};
