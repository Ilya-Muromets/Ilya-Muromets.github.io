(function () {
  'use strict';

  var consoleForm = document.querySelector('.segfault-console');
  var history = document.querySelector('.terminal-history');
  var input = document.querySelector('.terminal-input');
  if (!consoleForm || !history || !input) return;

  var commands = ['?', 'cat', 'cd', 'clear', 'help', 'ls', 'pwd'];
  var listedCommands = ['cat', 'cd', 'clear', 'ls', 'pwd'];
  var directories = {
    '/': ['void'],
    '/void': ['README.txt'],
    '/tmp': []
  };
  var files = {
    '/void/README.txt': [
      'welcome to the void',
      '...',
      'it\'s mostly empty',
      ' ',
      'at least the void is permanent',
      'much better than being',
      'temporary'
    ]
  };
  var currentPath = '/void';
  var emptyCatCount = 0;
  var commandRunning = false;

  function focusInput() {
    input.focus({ preventScroll: true });
  }

  function appendLine(text, className) {
    var line = document.createElement('div');
    line.className = 'terminal-entry' + (className ? ' ' + className : '');
    line.textContent = text;
    history.appendChild(line);
    return line;
  }

  function wait(milliseconds) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, milliseconds);
    });
  }

  async function typeFile(lines) {
    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    for (var lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      var text = lines[lineIndex];
      var output = appendLine('', 'terminal-file-content');

      if (reducedMotion) {
        output.textContent = text;
      } else {
        for (var characterIndex = 0; characterIndex < text.length; characterIndex += 1) {
          var character = document.createElement('span');
          character.className = 'terminal-typed-character';
          character.textContent = text[characterIndex];
          output.appendChild(character);
          trimHistory();
          await wait(45);
        }
      }

      trimHistory();
      if (!reducedMotion) {
        await wait(300);
      }
    }
  }

  function normalizePath(path) {
    var expanded = path || currentPath;
    if (expanded === '~' || expanded.indexOf('~/') === 0) {
      expanded = '/void' + expanded.slice(1);
    } else if (expanded[0] !== '/') {
      expanded = currentPath + '/' + expanded;
    }

    var parts = [];
    expanded.split('/').forEach(function (part) {
      if (!part || part === '.') return;
      if (part === '..') {
        parts.pop();
        return;
      }
      parts.push(part);
    });

    return '/' + parts.join('/');
  }

  function isDirectory(path) {
    return Object.prototype.hasOwnProperty.call(directories, path);
  }

  function isFile(path) {
    return Object.prototype.hasOwnProperty.call(files, path);
  }

  function basename(path) {
    if (path === '/') return '/';
    return path.slice(path.lastIndexOf('/') + 1);
  }

  function listPath(path, commandName) {
    var resolved = normalizePath(path);
    if (isFile(resolved)) {
      appendLine(basename(resolved), 'terminal-file');
      return;
    }
    if (!isDirectory(resolved)) {
      appendLine(commandName + ": cannot access '" + path + "': No such file or directory");
      return;
    }

    directories[resolved].forEach(function (name) {
      var child = normalizePath(resolved + '/' + name);
      appendLine(name + (isDirectory(child) ? '/' : ''), isDirectory(child)
        ? 'terminal-directory'
        : 'terminal-file');
    });
  }

  async function runCommand(commandLine) {
    var args = commandLine.trim().split(/\s+/);
    var command = args.shift();
    if (!command) return;
    var isEmptyCat = command === 'cat' && !args.length;
    if (!isEmptyCat) emptyCatCount = 0;

    if (command === '?' || command === 'help') {
      appendLine('Available commands:');
      listedCommands.forEach(function (name) {
        appendLine('  ' + name);
      });
      return;
    }

    if (command === 'pwd') {
      appendLine(currentPath);
      return;
    }

    if (command === 'clear') {
      history.replaceChildren();
      return;
    }

    if (command === 'cd') {
      if (args.length > 1) {
        appendLine('cd: too many arguments');
        return;
      }

      var destination = normalizePath(args[0] || '~');
      if (isFile(destination)) {
        appendLine('cd: ' + (args[0] || '~') + ': Not a directory');
        return;
      }
      if (!isDirectory(destination)) {
        appendLine('cd: ' + (args[0] || '~') + ': No such file or directory');
        return;
      }

      currentPath = destination;
      return;
    }

    if (command === 'ls') {
      if (!args.length) {
        listPath(currentPath, 'ls');
        return;
      }
      args.forEach(function (path) {
        listPath(path, 'ls');
      });
      return;
    }

    if (command === 'cat') {
      if (!args.length) {
        emptyCatCount += 1;
        if (emptyCatCount === 3) {
          appendLine('meow meow meow meow meow meow meow meow meow meow meow');
          emptyCatCount = 0;
        } else {
          appendLine('cat: missing file operand');
        }
        return;
      }

      for (var pathIndex = 0; pathIndex < args.length; pathIndex += 1) {
        var path = args[pathIndex];
        var resolved = normalizePath(path);
        if (isDirectory(resolved)) {
          appendLine('cat: ' + path + ': Is a directory');
          continue;
        }
        if (!isFile(resolved)) {
          appendLine('cat: ' + path + ': No such file or directory');
          continue;
        }
        await typeFile(files[resolved]);
      }
      return;
    }

    appendLine(command + ": command not found (type '?' or 'help' to list commands)");
  }

  function commonPrefix(values) {
    if (!values.length) return '';
    return values.slice(1).reduce(function (prefix, value) {
      var length = 0;
      var limit = Math.min(prefix.length, value.length);
      while (length < limit && prefix[length] === value[length]) length += 1;
      return prefix.slice(0, length);
    }, values[0]);
  }

  function pathCandidates(token, command) {
    var slash = token.lastIndexOf('/');
    var typedDirectory = slash === -1 ? '' : token.slice(0, slash + 1);
    var namePrefix = slash === -1 ? token : token.slice(slash + 1);
    var directoryPath = normalizePath(typedDirectory || '.');
    if (!isDirectory(directoryPath)) return [];

    var candidates = directories[directoryPath].filter(function (name) {
      var childPath = normalizePath(directoryPath + '/' + name);
      if (command === 'cd' && !isDirectory(childPath)) return false;
      return name.indexOf(namePrefix) === 0;
    }).map(function (name) {
      var childPath = normalizePath(directoryPath + '/' + name);
      return typedDirectory + name + (isDirectory(childPath) ? '/' : '');
    });

    if (command === 'cd' || command === 'ls') {
      ['../'].forEach(function (name) {
        if (name.indexOf(token) === 0 && candidates.indexOf(name) === -1) {
          candidates.push(name);
        }
      });
    }

    return candidates;
  }

  function autocomplete() {
    var value = input.value;
    var selectionStart = input.selectionStart === null ? value.length : input.selectionStart;
    var selectionEnd = input.selectionEnd === null ? selectionStart : input.selectionEnd;
    var beforeCursor = value.slice(0, selectionStart);
    var tokenMatch = beforeCursor.match(/(?:^|\s)(\S*)$/);
    if (!tokenMatch) return;

    var token = tokenMatch[1];
    var tokenStart = selectionStart - token.length;
    var priorTokens = beforeCursor.slice(0, tokenStart).trim().split(/\s+/);
    var completingCommand = !priorTokens[0];
    var matches = completingCommand
      ? commands.filter(function (command) { return command.indexOf(token) === 0; })
      : pathCandidates(token, priorTokens[0]);
    if (!matches.length) return;

    var suffix = value.slice(selectionEnd);
    var uniqueMatch = matches.length === 1;
    var needsSpace = uniqueMatch && matches[0].slice(-1) !== '/' && !/^\s/.test(suffix);
    var completion = uniqueMatch ? matches[0] + (needsSpace ? ' ' : '') : commonPrefix(matches);
    if (completion === token) return;

    input.value = value.slice(0, tokenStart) + completion + suffix;
    var caret = tokenStart + completion.length;
    input.setSelectionRange(caret, caret);
  }

  function trimHistory() {
    if (!history.firstElementChild) return;
    var lineHeight = history.firstElementChild.getBoundingClientRect().height;
    var maxHeight = parseFloat(window.getComputedStyle(history).maxHeight);
    var capacity = Math.max(1, Math.floor(maxHeight / lineHeight));

    while (history.children.length > capacity) {
      history.removeChild(history.firstChild);
    }
  }

  consoleForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (commandRunning) return;

    var commandLine = input.value;
    appendLine('~$ ' + commandLine);
    input.value = '';
    commandRunning = true;

    try {
      await runCommand(commandLine);
    } finally {
      commandRunning = false;
      window.requestAnimationFrame(trimHistory);
    }
  });

  consoleForm.addEventListener('click', focusInput);

  input.addEventListener('keydown', function (event) {
    if (event.key !== 'Tab' || event.shiftKey) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    autocomplete();
  });

  document.addEventListener('keydown', function (event) {
    if (document.activeElement === input) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    var interactiveTarget = event.target instanceof Element
      ? event.target.closest('a, button')
      : null;
    if (interactiveTarget && (event.key === 'Enter' || event.key === ' ')) return;

    if (event.key === 'Tab' && !event.shiftKey && !interactiveTarget) {
      event.preventDefault();
      focusInput();
      autocomplete();
      return;
    }

    if (event.key.length === 1) {
      event.preventDefault();
      input.value += event.key;
      focusInput();
      input.setSelectionRange(input.value.length, input.value.length);
      return;
    }

    if (event.key === 'Backspace') {
      event.preventDefault();
      input.value = input.value.slice(0, -1);
      focusInput();
      input.setSelectionRange(input.value.length, input.value.length);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      focusInput();
      consoleForm.requestSubmit();
    }
  });

  window.addEventListener('focus', focusInput);
  window.addEventListener('resize', trimHistory);
  focusInput();
})();
