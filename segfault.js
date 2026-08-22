(function () {
  'use strict';

  var consoleForm = document.querySelector('.segfault-console');
  var history = document.querySelector('.terminal-history');
  var input = document.querySelector('.terminal-input');
  var promptPrefix = document.querySelector('.terminal-prompt-prefix');
  if (!consoleForm || !history || !input || !promptPrefix) return;

  // Edit filenames and all story text in this block.
  var storyContent = {
    actionResponseDelay: 1000,
    deletionCommandPause: 300,
    crashAnimationDuration: 5000,
    voidFile: {
      name: 'VOID.txt',
      lines: [
        'welcome to the[300] void',
        '.[300].[300].[300]',
        'or well,[300] a sort of void',
        'it\'s mostly empty',
        '.[300].[300].[300]',
        'there might be more exciting things out there',
        'but they\'re only[400]',
        'temporary'
      ],
      afterRmLearned: [
        [
          'oh you learned ‘rm’?',
          'that’s my favourite command'
        ],
        [
          'what are you waiting for[300]',
          'send me to the void!'
        ],
        [
          'delete me!'
        ]
      ],
      deleteResponse: [
        '.[300].[300].[300]',
        'i guess that didn\'t work',
        'but thanks for trying',
        '.[300].[300].[300]',
        'oh how about',
        'sudo rm -rf',
        'that should work[1000]',
        'maybe',
        '.[300].[300].[300]',
        'i lost the password though',
        'i thought i wrote it down in some',
        'file somewhere'
      ],
      sudoDeleteError: 'cannot delete {file}, that would be infinite recursion or something idk',
      sudoDeleteResponse: [
        '.[300].[300].[1000]',
        'rats',
        'i guess everything you delete ends up here so[500]',
        'that kind of makes sense',
        '.[300].[300].[300]',
        'wait that’s it[500]',
        'maybe we just need to delete[300]',
        'everything'
      ],
      afterSudoDelete: [
        'try deleting everything'
      ]
    },
    tempFile: {
      name: 'TEMP.txt',
      firstRead: [
        'who are you?[1000]',
        'did void send you here?',
        '.[300].[300].[300]',
        '.[300].[300].[300]',
        'sorry I can’t hear you very well',
        'this place is[500]',
        'cluttered[300]',
        'can you help me clean it up?[300]',
        'here I’ll give you a new command',
        '‘rm’',
        'use it to clean up those pesky binary files around me',
        'and then we can chat'
      ],
      laterReads: [
        'are you not finished yet?[300]',
        '‘rm’ those .bin files and we’ll talk'
      ],
      afterCleanup: [
        'thanks[300]',
        'that’s a lot quieter[300]',
        '.[300].[300].[300]',
        'just one more thing left to remove[1000]'
      ],
      afterCleanupCommand: 'sudo rm -rf /user/*',
      sudoDeleteResponse: [
        'no no no stop stop no stop noooooo'
      ],
      repeatedSudoDeleteResponse: [
        'I’M ALREADY IN THE VOID, STOP PUTTING ME IN THE VOID'
      ],
      afterSudoDelete: [
        'IT’S SO LOUD IN HERE',
        'WHY IS THE VOID LOUD',
        'AAAAAAAAAAAAAAAAA'
      ],
      deleteResponse: [
        '.[300].[300].[300]',
        'you tried to delete me?[500]',
        'very rude[500]',
        '.[300].[300].[300]',
        'actually[500]',
        'that\'s not a bad idea[700]',
        'sudo rm -rf /user/*'
      ]
    },
    binaryFiles: [
      {
        name: '8K3.bin',
        text: 'oh how nice it is to be a simple binary file',
        deleteResponse: 'eek'
      },
      {
        name: '1E9.bin',
        text: 'my favourite color is blue, what’s yours?',
        deleteResponse: 'ow'
      },
      {
        name: '1G4.bin',
        text: 'have you come to restore us?',
        deleteResponse: 'aaaa'
      },
      {
        name: '0E9.bin',
        text: 'super_secret_password=“fishman123”',
        plaintext: true,
        deleteResponse: 'oof'
      },
      {
        name: '2B7.bin',
        text: 'I think the user deleted me accidentally, I was probably important',
        deleteResponse: 'owie'
      }
    ],
    sudo: {
      password: 'fishman123',
      passwordPrompt: '[sudo] password: ',
      removalTargets: ['./', './*', '*']
    },
    crashMessage: 'Segmentation Fault (Core Dumped)',
    peacefulEnding: {
      messageDelay: 1500,
      stars: [
        '       .             *          .',
        '  *          .              +',
        '         +          *              .',
        ' .               .         *',
        '      *                 +         .'
      ],
      lines: [
        '“.[300].[300].[2500]”',
        '“so this is a real void[2500]”',
        '“it’s nice here”'
      ]
    }
  };

  var commands = ['?', 'cat', 'cd', 'clear', 'help', 'ls', 'pwd'];
  var listedCommands = ['cat', 'cd', 'clear', 'ls', 'pwd'];
  var rootPath = '/void';
  var voidFilePath = '/void/' + storyContent.voidFile.name;
  var tempFilePath = '/tmp/' + storyContent.tempFile.name;
  var movedTempFilePath = '/void/' + storyContent.tempFile.name;
  var directories = {
    '/void': [storyContent.voidFile.name],
    '/tmp': [storyContent.tempFile.name].concat(storyContent.binaryFiles.map(function (file) {
      return file.name;
    }))
  };
  var files = {};
  var removalMessages = {};
  files[voidFilePath] = storyContent.voidFile.lines.slice();
  files[tempFilePath] = storyContent.tempFile.firstRead.slice();
  storyContent.binaryFiles.forEach(function (file) {
    var path = '/tmp/' + file.name;
    files[path] = [file.plaintext ? file.text : textToHex(file.text)];
    removalMessages[path] = file.deleteResponse;
  });
  var currentPath = rootPath;
  var emptyCatCount = 0;
  var commandRunning = false;
  var rmUnlocked = false;
  var sudoUnlocked = false;
  var pendingSudoTarget = null;
  var terminalFinished = false;
  var voidReadStage = -1;
  var voidSudoDeleteAttempted = false;
  var typingLineActive = false;
  var typingLineSkipped = false;
  var finishTypingDelay = null;
  var commandHistory = [];
  var commandHistoryIndex = 0;
  var commandHistoryDraft = '';

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

  function waitForTypingDelay(milliseconds) {
    return new Promise(function (resolve) {
      var timeoutId;
      function finish() {
        if (finishTypingDelay === cancel) finishTypingDelay = null;
        resolve();
      }
      function cancel() {
        window.clearTimeout(timeoutId);
        finish();
      }
      timeoutId = window.setTimeout(finish, milliseconds);
      finishTypingDelay = cancel;
    });
  }

  function fastForwardTypingLine() {
    if (!typingLineActive) return false;
    typingLineSkipped = true;
    if (finishTypingDelay) finishTypingDelay();
    return true;
  }

  function unlockCommand(name) {
    if (commands.indexOf(name) !== -1) return;
    commands.push(name);
    listedCommands.push(name);
  }

  function textToHex(text) {
    var encoded = encodeURIComponent(text);
    var hex = '';
    for (var index = 0; index < encoded.length; index += 1) {
      if (encoded[index] === '%') {
        hex += encoded.slice(index + 1, index + 3).toLowerCase();
        index += 2;
      } else {
        hex += encoded.charCodeAt(index).toString(16).padStart(2, '0');
      }
    }
    return hex;
  }

  function emphasizedCharacters(text) {
    var emphasized = new Array(text.length).fill(false);
    var matches = text.matchAll(/^everything$|^sudo .+$|\b(?:rm|void|temporary)\b|‘[^’]+’|“[^”]+”/g);

    for (var match of matches) {
      for (var index = match.index; index < match.index + match[0].length; index += 1) {
        emphasized[index] = true;
      }
    }

    return emphasized;
  }

  function parseTimedText(source) {
    var text = '';
    var pauses = {};
    var cursor = 0;
    var matches = source.matchAll(/\[(\d+)\]/g);

    for (var match of matches) {
      text += source.slice(cursor, match.index);
      var position = text.length;
      if (!pauses[position]) pauses[position] = [];
      pauses[position].push(Number(match[1]));
      cursor = match.index + match[0].length;
    }
    text += source.slice(cursor);

    return { text: text, pauses: pauses };
  }

  function appendFileCharacter(output, character, emphasized, animated, voice, characterIndex) {
    var span = document.createElement('span');
    span.className = 'terminal-file-character';
    if (emphasized) span.classList.add('terminal-file-emphasis');
    if (animated) {
      span.classList.add('terminal-typed-character');
      if (voice) span.classList.add('terminal-typed-' + voice);
      if (voice === 'temp') {
        var directions = [
          [-7, -5, -4],
          [5, -7, 3],
          [-4, 6, -2],
          [8, 3, 5],
          [-6, 4, 2],
          [4, -4, -5]
        ];
        var direction = directions[characterIndex % directions.length];
        span.style.setProperty('--terminal-impact-x', direction[0] + 'px');
        span.style.setProperty('--terminal-impact-y', direction[1] + 'px');
        span.style.setProperty('--terminal-impact-rotate', direction[2] + 'deg');
      }
    }
    span.textContent = character;
    output.appendChild(span);
  }

  async function typeFile(lines, typingSpeed, voice, outputClassName, useEmphasis) {
    var speed = typingSpeed || 1;
    if (voice === 'temp' || voice === 'void') speed *= 0.8;

    for (var lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      var timedText = parseTimedText(lines[lineIndex]);
      var text = timedText.text;
      var outputClass = 'terminal-file-content'
        + (voice ? ' terminal-voice-' + voice : '')
        + (outputClassName ? ' ' + outputClassName : '');
      var output = appendLine('', outputClass);
      var emphasized = typeof useEmphasis === 'function'
        ? useEmphasis(text)
        : useEmphasis === false
          ? new Array(text.length).fill(false)
          : emphasizedCharacters(text);
      typingLineSkipped = false;
      typingLineActive = true;

      for (var characterIndex = 0; characterIndex < text.length; characterIndex += 1) {
        if (typingLineSkipped) {
          for (; characterIndex < text.length; characterIndex += 1) {
            appendFileCharacter(
              output,
              text[characterIndex],
              emphasized[characterIndex],
              false,
              voice,
              characterIndex
            );
          }
          break;
        }
        var inlinePauses = timedText.pauses[characterIndex] || [];
        for (var pauseIndex = 0; pauseIndex < inlinePauses.length; pauseIndex += 1) {
          await waitForTypingDelay(inlinePauses[pauseIndex]);
          if (typingLineSkipped) break;
        }
        if (typingLineSkipped) {
          characterIndex -= 1;
          continue;
        }
        appendFileCharacter(
          output,
          text[characterIndex],
          emphasized[characterIndex],
          true,
          voice,
          characterIndex
        );
        trimHistory();
        await waitForTypingDelay(45 / speed);
      }
      var endingPauses = timedText.pauses[text.length] || [];
      for (var endingPauseIndex = 0;
        endingPauseIndex < endingPauses.length && !typingLineSkipped;
        endingPauseIndex += 1) {
        await waitForTypingDelay(endingPauses[endingPauseIndex]);
      }

      trimHistory();
      if (!typingLineSkipped) {
        await waitForTypingDelay(300 / speed);
      }
      typingLineActive = false;
      typingLineSkipped = false;
    }
  }

  async function typeCommandOutput(text, className, emphasis) {
    await typeFile([text], 2, '', 'terminal-command-output' + (className
      ? ' ' + className
      : ''), emphasis || false);
  }

  function commandErrorEmphasis(text) {
    var emphasized = new Array(text.length).fill(false);
    var command = text.match(/^[^\s:]+(?=:)/);
    if (!command) return emphasized;
    for (var index = 0; index < command[0].length; index += 1) {
      emphasized[index] = true;
    }
    return emphasized;
  }

  async function typeCommandError(text) {
    await typeCommandOutput(text, 'terminal-command-error', commandErrorEmphasis);
  }

  async function crashTerminal() {
    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    await wait(storyContent.deletionCommandPause);
    terminalFinished = true;
    input.disabled = true;
    if (!reducedMotion) buildCorruptionText();
    consoleForm.style.setProperty(
      '--terminal-crash-duration',
      storyContent.crashAnimationDuration + 'ms'
    );
    consoleForm.classList.add('terminal-crashing');
    if (!reducedMotion) await wait(storyContent.crashAnimationDuration);
    history.replaceChildren();
    appendLine(storyContent.crashMessage, 'terminal-crash-message');
    consoleForm.classList.remove('terminal-crashing');
    consoleForm.classList.add('terminal-crashed');
  }

  function buildCorruptionText() {
    var lines = Array.prototype.map.call(history.children, function (line) {
      return line.textContent;
    });
    var scrambleCharacters = '@#$%&?!01';
    var blockCharacters = ['█', '▓', '▒', '■'];
    var blockColors = ['#fff8ec', '#ffcf8f', '#ffe4b8', '#ff7f50'];
    var characterCount = 0;
    history.replaceChildren();

    lines.forEach(function (text, lineIndex) {
      var output = appendLine('', 'terminal-corruption-text');
      for (var index = 0; index < text.length; index += 1) {
        var character = text[index];
        var span = document.createElement('span');
        span.textContent = character;
        if (/\s/.test(character)) {
          output.appendChild(span);
          continue;
        }

        var variant = (characterCount * 7 + lineIndex * 3) % scrambleCharacters.length;
        span.className = 'terminal-corruption-character';
        span.setAttribute('data-scramble', scrambleCharacters[variant]);
        span.setAttribute('data-block', blockCharacters[variant % blockCharacters.length]);
        span.style.setProperty(
          '--corruption-delay',
          ((characterCount * 83 + lineIndex * 137) % 1600) + 'ms'
        );
        span.style.setProperty(
          '--corruption-color',
          blockColors[variant % blockColors.length]
        );
        span.style.setProperty('--corruption-x', (variant % 2 ? 2 : -2) + 'px');
        output.appendChild(span);
        characterCount += 1;
      }
    });
  }

  async function showPeacefulEnding() {
    terminalFinished = true;
    input.disabled = true;
    history.replaceChildren();
    consoleForm.classList.add('terminal-peaceful');
    appendStarField();
    await wait(storyContent.peacefulEnding.messageDelay);
    await typeFile(storyContent.peacefulEnding.lines, 1, 'void');
  }

  function appendStarField() {
    var field = document.createElement('div');
    field.className = 'terminal-star-field';
    var track = document.createElement('div');
    track.className = 'terminal-star-track';

    for (var copyIndex = 0; copyIndex < 2; copyIndex += 1) {
      var panel = document.createElement('div');
      panel.className = 'terminal-star-panel';
      for (var lineIndex = 0; lineIndex < 18; lineIndex += 1) {
        var line = document.createElement('div');
        line.className = 'terminal-star-line terminal-star-phase-' + ((lineIndex % 4) + 1);
        line.textContent = storyContent.peacefulEnding.stars[
          lineIndex % storyContent.peacefulEnding.stars.length
        ];
        panel.appendChild(line);
      }
      track.appendChild(panel);
    }

    field.appendChild(track);
    history.appendChild(field);
  }

  function resetPrompt() {
    pendingSudoTarget = null;
    promptPrefix.textContent = '~$\u00a0';
    input.type = 'text';
    input.setAttribute('aria-label', 'Terminal input');
  }

  function protectedFileForPath(path) {
    var lowercasePath = path.toLowerCase();
    if (lowercasePath === '/void' || lowercasePath === voidFilePath.toLowerCase()) {
      return 'void';
    }
    if (lowercasePath === '/tmp' || lowercasePath === tempFilePath.toLowerCase()) {
      return 'temp';
    }
    return null;
  }

  function allTemporaryFilesRemoved() {
    return storyContent.binaryFiles.every(function (file) {
      return !isFile('/tmp/' + file.name);
    });
  }

  function beginVoidRmDialogue() {
    if (voidReadStage !== -1 || voidSudoDeleteAttempted) return;
    voidReadStage = 0;
    files[voidFilePath] = storyContent.voidFile.afterRmLearned[voidReadStage].slice();
  }

  function advanceVoidRmDialogue() {
    if (voidReadStage === -1 || voidSudoDeleteAttempted) return;
    if (voidReadStage < storyContent.voidFile.afterRmLearned.length - 1) {
      voidReadStage += 1;
      files[voidFilePath] = storyContent.voidFile.afterRmLearned[voidReadStage].slice();
    }
  }

  function isVoidSudoTarget(target) {
    var lowercaseTarget = target.toLowerCase();
    var relativeTarget = lowercaseTarget.indexOf('./') === 0
      ? lowercaseTarget.slice(2)
      : lowercaseTarget;
    return lowercaseTarget === '/void'
      || lowercaseTarget === voidFilePath.toLowerCase()
      || relativeTarget === storyContent.voidFile.name.toLowerCase();
  }

  function isTempSudoTarget(target) {
    var lowercaseTarget = target.toLowerCase();
    var relativeTarget = lowercaseTarget.indexOf('./') === 0
      ? lowercaseTarget.slice(2)
      : lowercaseTarget;
    return lowercaseTarget === tempFilePath.toLowerCase()
      || relativeTarget === storyContent.tempFile.name.toLowerCase();
  }

  function moveFileToVoid(path) {
    var contents = files[path];
    var removalMessage = removalMessages[path];
    var parentPath = path.slice(0, path.lastIndexOf('/')) || '/';
    var name = basename(path);
    var destination = '/void/' + name;

    delete files[path];
    delete removalMessages[path];
    directories[parentPath] = directories[parentPath].filter(function (entry) {
      return entry !== name;
    });

    files[destination] = contents;
    if (removalMessage) removalMessages[destination] = removalMessage;
    if (directories['/void'].indexOf(name) === -1) directories['/void'].push(name);
  }

  function expandRmPaths(paths) {
    return paths.reduce(function (expandedPaths, path) {
      if (path.indexOf('*') === -1) {
        expandedPaths.push(path);
        return expandedPaths;
      }

      var slash = path.lastIndexOf('/');
      var typedDirectory = slash === -1 ? '' : path.slice(0, slash + 1);
      var pattern = slash === -1 ? path : path.slice(slash + 1);
      var directoryPath = normalizePath(typedDirectory || '.');
      if (!isDirectory(directoryPath)) {
        expandedPaths.push(path);
        return expandedPaths;
      }

      var expression = new RegExp('^' + pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*') + '$');
      var matches = directories[directoryPath].filter(function (name) {
        return expression.test(name);
      });
      if (!matches.length) {
        expandedPaths.push(path);
        return expandedPaths;
      }

      matches.forEach(function (name) {
        expandedPaths.push(typedDirectory + name);
      });
      return expandedPaths;
    }, []);
  }

  function normalizePath(path) {
    var expanded = path || currentPath;
    if (expanded === '~' || expanded.indexOf('~/') === 0) {
      expanded = rootPath + expanded.slice(1);
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

    var normalized = '/' + parts.join('/');
    return normalized === '/' ? rootPath : normalized;
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

  async function listPath(path, commandName) {
    var resolved = normalizePath(path);
    if (isFile(resolved)) {
      await typeCommandOutput(basename(resolved), 'terminal-command-file');
      return;
    }
    if (!isDirectory(resolved)) {
      await typeCommandError(commandName + ": cannot access '" + path
        + "': No such file or directory");
      return;
    }

    for (var entryIndex = 0; entryIndex < directories[resolved].length; entryIndex += 1) {
      var name = directories[resolved][entryIndex];
      var child = normalizePath(resolved + '/' + name);
      await typeCommandOutput(
        name + (isDirectory(child) ? '/' : ''),
        isDirectory(child) ? 'terminal-command-directory' : 'terminal-command-file'
      );
    }
  }

  async function runCommand(commandLine) {
    var args = commandLine.trim().split(/\s+/);
    var command = args.shift();
    if (!command) return;
    var isEmptyCat = command === 'cat' && !args.length;
    if (!isEmptyCat) emptyCatCount = 0;

    if (command === '?' || command === 'help') {
      await typeCommandOutput('Available commands:');
      for (var commandIndex = 0; commandIndex < listedCommands.length; commandIndex += 1) {
        await typeCommandOutput('  ' + listedCommands[commandIndex]);
      }
      return;
    }

    if (command === 'pwd') {
      await typeCommandOutput(currentPath);
      return;
    }

    if (command === 'clear') {
      history.replaceChildren();
      return;
    }

    if (command === 'sudo' && sudoUnlocked) {
      if (args[0] === 'rm' && args[1] === '-rf' && args.length <= 3) {
        pendingSudoTarget = args[2] || '';
        promptPrefix.textContent = storyContent.sudo.passwordPrompt;
        input.type = 'password';
        input.setAttribute('aria-label', 'Sudo password');
        return;
      }
      await typeCommandError('sudo: unsupported command');
      return;
    }

    if (command === 'cd') {
      if (args.length > 1) {
        await typeCommandError('cd: too many arguments');
        return;
      }

      var destination = normalizePath(args[0] || '~');
      if (isFile(destination)) {
        await typeCommandError('cd: ' + (args[0] || '~') + ': Not a directory');
        return;
      }
      if (!isDirectory(destination)) {
        await typeCommandError('cd: ' + (args[0] || '~') + ': No such file or directory');
        return;
      }

      currentPath = destination;
      return;
    }

    if (command === 'ls') {
      if (!args.length) {
        await listPath(currentPath, 'ls');
        return;
      }
      for (var lsIndex = 0; lsIndex < args.length; lsIndex += 1) {
        await listPath(args[lsIndex], 'ls');
      }
      return;
    }

    if (command === 'cat') {
      if (!args.length) {
        emptyCatCount += 1;
        if (emptyCatCount === 3) {
          await typeCommandOutput('meow meow meow meow meow meow meow meow meow meow meow');
          emptyCatCount = 0;
        } else {
          await typeCommandError('cat: missing file operand');
        }
        return;
      }

      for (var pathIndex = 0; pathIndex < args.length; pathIndex += 1) {
        var path = args[pathIndex];
        var resolved = normalizePath(path);
        if (isDirectory(resolved)) {
          await typeCommandError('cat: ' + path + ': Is a directory');
          continue;
        }
        if (!isFile(resolved)) {
          await typeCommandError('cat: ' + path + ': No such file or directory');
          continue;
        }
        var voice = resolved === tempFilePath || resolved === movedTempFilePath
          ? 'temp'
          : resolved === voidFilePath ? 'void' : '';
        var temporaryFilesRemoved = resolved === tempFilePath && allTemporaryFilesRemoved();
        var displayedLines = temporaryFilesRemoved
          ? storyContent.tempFile.afterCleanup
          : files[resolved];
        if (voice) await wait(storyContent.actionResponseDelay);
        await typeFile(displayedLines, resolved.slice(-4) === '.bin' ? 2 : 1, voice);
        if (resolved === tempFilePath) {
          if (temporaryFilesRemoved) {
            await wait(storyContent.actionResponseDelay);
            await typeFile([storyContent.tempFile.afterCleanupCommand], 1, 'temp');
            await crashTerminal();
            return;
          }
          files[resolved] = temporaryFilesRemoved
            ? storyContent.tempFile.afterCleanup.slice()
            : storyContent.tempFile.laterReads.slice();
          if (!temporaryFilesRemoved && !rmUnlocked) {
            rmUnlocked = true;
            unlockCommand('rm');
            beginVoidRmDialogue();
          }
        } else if (resolved === voidFilePath) {
          advanceVoidRmDialogue();
        }
      }
      return;
    }

    if (command === 'rm' && rmUnlocked) {
      if (!args.length) {
        await typeCommandError('rm: missing operand');
        return;
      }

      var rmPaths = expandRmPaths(args);
      for (var rmIndex = 0; rmIndex < rmPaths.length; rmIndex += 1) {
        var path = rmPaths[rmIndex];
        var resolved = normalizePath(path);
        var protectedFile = protectedFileForPath(resolved);
        if (protectedFile) {
          await typeCommandError("rm: cannot remove '" + path + "': Permission denied");
          if (protectedFile === 'temp') {
            await wait(storyContent.actionResponseDelay);
            await typeFile(storyContent.tempFile.deleteResponse, 1, 'temp');
            await crashTerminal();
            return;
          }

          await wait(storyContent.actionResponseDelay);
          await typeFile(storyContent.voidFile.deleteResponse, 1, 'void');
          if (!sudoUnlocked) {
            sudoUnlocked = true;
            unlockCommand('sudo');
          }
          continue;
        }
        if (isDirectory(resolved)) {
          await typeCommandError("rm: cannot remove '" + path + "': Is a directory");
          continue;
        }
        if (!isFile(resolved)) {
          await typeCommandError("rm: cannot remove '" + path + "': No such file or directory");
          continue;
        }
        var removalMessage = removalMessages[resolved];
        moveFileToVoid(resolved);
        if (removalMessage) {
          await wait(storyContent.actionResponseDelay);
          await typeFile([removalMessage]);
        }
      }
      return;
    }

    await typeCommandError(command + ": command not found (type '?' or 'help' to list commands)");
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

    if (command === 'cd') {
      ['/tmp/', '/void/'].forEach(function (directory) {
        if (directory.indexOf(token) === 0 && candidates.indexOf(directory) === -1) {
          candidates.push(directory);
        }
      });
    }

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

  function navigateCommandHistory(direction) {
    if (!commandHistory.length || pendingSudoTarget !== null) return false;
    if (commandHistoryIndex === commandHistory.length) {
      commandHistoryDraft = input.value;
    }

    commandHistoryIndex = Math.max(
      0,
      Math.min(commandHistory.length, commandHistoryIndex + direction)
    );
    input.value = commandHistoryIndex === commandHistory.length
      ? commandHistoryDraft
      : commandHistory[commandHistoryIndex];
    input.setSelectionRange(input.value.length, input.value.length);
    return true;
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
    if (commandRunning || terminalFinished) return;

    if (pendingSudoTarget !== null) {
      var password = input.value;
      input.value = '';
      commandRunning = true;
      await typeCommandOutput(storyContent.sudo.passwordPrompt);
      if (password !== storyContent.sudo.password) {
        await typeCommandError('Sorry, try again.');
        resetPrompt();
        commandRunning = false;
        return;
      }

      var sudoTarget = pendingSudoTarget;
      resetPrompt();
      try {
        if (isVoidSudoTarget(sudoTarget)) {
          await typeCommandError(storyContent.voidFile.sudoDeleteError.replace(
            '{file}',
            storyContent.voidFile.name
          ));
          await wait(storyContent.actionResponseDelay);
          await typeFile(storyContent.voidFile.sudoDeleteResponse, 1, 'void');
          voidSudoDeleteAttempted = true;
          files[voidFilePath] = storyContent.voidFile.afterSudoDelete.slice();
        } else if (isTempSudoTarget(sudoTarget)) {
          await wait(storyContent.actionResponseDelay);
          if (isFile(movedTempFilePath) && !isFile(tempFilePath)) {
            await typeFile(storyContent.tempFile.repeatedSudoDeleteResponse, 1, 'temp');
          } else {
            await typeFile(storyContent.tempFile.sudoDeleteResponse, 1, 'temp');
            if (isFile(tempFilePath)) moveFileToVoid(tempFilePath);
            files[movedTempFilePath] = storyContent.tempFile.afterSudoDelete.slice();
          }
        } else if (storyContent.sudo.removalTargets.indexOf(sudoTarget) !== -1) {
          await showPeacefulEnding();
        } else if (!sudoTarget) {
          await typeCommandError('rm: missing operand');
        } else {
          await typeCommandError("rm: cannot remove '" + sudoTarget
            + "': No such file or directory");
        }
      } finally {
        commandRunning = false;
        window.requestAnimationFrame(trimHistory);
      }
      return;
    }

    var commandLine = input.value;
    appendLine('~$ ' + commandLine);
    input.value = '';
    if (commandLine.trim()) {
      commandHistory.push(commandLine);
      commandHistoryIndex = commandHistory.length;
      commandHistoryDraft = '';
    }
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
    if (event.key === 'Enter' && fastForwardTypingLine()) {
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      if (navigateCommandHistory(event.key === 'ArrowUp' ? -1 : 1)) {
        event.preventDefault();
      }
      return;
    }
    if (event.key !== 'Tab' || event.shiftKey) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    autocomplete();
  });

  document.addEventListener('keydown', function (event) {
    if (event.defaultPrevented) return;
    if (terminalFinished) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Enter' && fastForwardTypingLine()) {
      event.preventDefault();
      return;
    }
    if (document.activeElement === input) return;

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
