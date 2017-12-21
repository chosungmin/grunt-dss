/*
 * DSS
 * https://github.com/darcyclarke/DSS
 *
 * Copyright (c) 2013 darcyclarke
 * Licensed under the MIT license.
 */

// Include dependancies
var handlebars = require('handlebars');
var dss = require('dss');
var ejs = require('ejs');

// Expose
module.exports = function(grunt){

	// Register DSS
	grunt.registerMultiTask('dss', 'Parse DSS comment blocks', function(){

		// Setup async promise
		var promise = this.async();

		// Merge task-specific and/or target-specific options with defaults
		var options = this.options({
			template: __dirname + '/../template/',
			template_index: 'index.handlebars',
			output_index: 'index.html',
			include_empty_files: true,
			handlebar_helpers: {},
			import_css: []
		});

		// Output options if --verbose cl option is passed
		grunt.verbose.writeflags(options, 'Options');

		// Default handlebar helpers
		var default_handlebar_helpers = {
			replaceClassName: function (context, className) {
					className = className || '';

					if (!!className) {
						className = className.replace(/^\./, '').replace(/\./g, ' ');
					}

					return context.replace('{class}', className);
			},

			xIf: function (lvalue, operator, rvalue, options) {
			    var operators, result;

			    if (arguments.length < 3) {
			        throw new Error("Handlerbars Helper 'compare' needs 2 parameters");
			    }

			    if (options === undefined) {
			        options = rvalue;
			        rvalue = operator;
			        operator = "===";
			    }

			    operators = {
			        '==': function (l, r) { return l == r; },
			        '===': function (l, r) { return l === r; },
			        '!=': function (l, r) { return l != r; },
			        '!==': function (l, r) { return l !== r; },
			        '<': function (l, r) { return l < r; },
			        '>': function (l, r) { return l > r; },
			        '<=': function (l, r) { return l <= r; },
			        '>=': function (l, r) { return l >= r; },
			        '||': function (l, r) { return l || r; },
			        '&&': function (l, r) { return l && r; },
			        'typeof': function (l, r) { return typeof l == r; }
			    };

			    if (!operators[operator]) {
			        throw new Error("'xIf' doesn't know the operator " + operator);
			    }

			    result = operators[operator](lvalue, rvalue);

			    if (result) {
			        return options.fn(this);
			    } else {
			        return options.inverse(this);
			    }
			},

			previewParams: function (filePath, param, returnType) {
				var filename = [process.cwd(), filePath].join('/');
				var options = {};
				var data = {};

				if (!!param) {
					data = param.split(/,/).reduce(function(m,i){
					    var s = i.split(':');
					    m[s[0].replace(/\s/g, '')] = s[1].replace(/^\s?['|"]|\s?['|"]+$/g, '');
					    return m;
					}, {});
				}

				var compile = ejs.renderFile(filename, data, options, function(err, str){
					if (err) {
						return {
							path: line,
							html: err.message,
							escape_html: err.message
						}
					}

					var html = str.replace(/^\s*[\r\n]/gm, '');

					if (returnType == 'path') {
						return filePath;
					} else if (returnType == 'html') {
						return html;
					} else if (returnType == 'html') {
						return html.replace(/</g, '&lt;').replace(/>/g, '&gt;')
					}
				});

				return compile;
			}
		};

		// Describe file parsers
		dss.parser('preview', function(i, line, block, file){
			var filename = [process.cwd(), line].join('/');
			var data = {};
			var options = {};

			var compile = ejs.renderFile(filename, data, options, function(err, str){
				if (err) {
					return {
						path: line,
						html: err.message,
						escape_html: err.message
					}
				}

				var html = str.replace(/^\s*[\r\n]/gm, '');

				return {
					path: line,
					html: html,
					escape_html: html.replace(/</g, '&lt;').replace(/>/g, '&gt;')
				}
			});

			return compile;
		});

		// Describe params parsers
		dss.parser('params', function(i, line, block, file){
			return {
				param: line
			}
		});

		// Describe custom parsers
		for(key in options.parsers){
			dss.parser(key, options.parsers[key]);
		}

		// Save import css
		var import_css = [];
		options.import_css.forEach(function(f) {
			import_css.push({
				file: f
			});
		});

		// Describe custom handlebars helpers
		var handlebarHelpers = Object.assign({}, default_handlebar_helpers, options.handlebar_helpers);
		for(helper in handlebarHelpers) {
			handlebars.registerHelper( helper, handlebarHelpers[helper] );
		}

		// Build Documentation
		this.files.forEach(function(f){
			// Filter files based on their existence
			var src = f.src.filter(function(filepath) {

				// Warn on and remove invalid source files (if nonull was set).
				if(!grunt.file.exists(filepath)){
					grunt.log.warn('Source file "' + filepath + '" not found.');
					return false;
				} else {
					return true;
				}
			});

			// Setup
			var files = src,
					template_dir = options.template,
					output_dir = f.dest,
					length = files.length,
					styleguide = [];

			// Parse files
			files.map(function(filename){

				// Report file
				grunt.verbose.writeln('• ' + grunt.log.wordlist([filename], {color: 'cyan'}));

				// Parse
				dss.parse(grunt.file.read(filename), { file: filename }, function(parsed) {

					// Continue only if file contains DSS annotation
					if (options.include_empty_files || (parsed.blocks.length && !!parsed.blocks[0].name)) {
						// Add filename
						parsed['file'] = filename;

						// Add comment block to styleguide
						styleguide.push(parsed);
					}

					// Check if we're done
					if (length > 1) {
						length--;
					}
					else {
						// Set output template and file
						var template_filepath = template_dir + options.template_index,
								output_filepath = output_dir + options.output_index;

						if (!grunt.file.exists(template_filepath)) {
							grunt.fail.fatal('Cannot read the template file');
						}

						// copy template assets (except index.handlebars)
						grunt.file.expandMapping([
							'**/*',
							'!' + options.template_index
						], output_dir, { cwd: template_dir }).forEach(function(filePair) {
							filePair.src.forEach(function(src) {
								if (grunt.file.isDir(src)) {
									grunt.verbose.writeln('Creating ' + filePair.dest.cyan);
									grunt.file.mkdir(filePair.dest);
								} else {
									grunt.verbose.writeln('Copying ' + src.cyan + ' -> ' + filePair.dest.cyan);
									grunt.file.copy(src, filePair.dest);
								}
							});
						});

						// Create HTML ouput
						var html = handlebars.compile(grunt.file.read(template_filepath))({
							project: grunt.file.readJSON('package.json'),
							files: styleguide,
							import_css: import_css
						});

						var output_type = 'created', output = null;
						if (grunt.file.exists(output_filepath)) {
							output_type = 'overwrited';
							output = grunt.file.read(output_filepath);
						}
						// avoid write if there is no change
						if (output !== html) {
							// Render file
							grunt.file.write(output_filepath, html);

							// Report build
							grunt.log.writeln('✓ Styleguide ' + output_type + ' at: ' + grunt.log.wordlist([output_dir], {color: 'cyan'}));
						}
						else {
							// no change
							grunt.log.writeln('‣ Styleguide unchanged');
						}

						// Return promise
						promise();

					}
				});

			});

		});

	});

};
