/* jshint esversion: 6 */

var dot = dot || {};
var base = base || require('./base');

function tokenize(line) {
    if (!line) return [];
    line.trim().split(/[\s;]*/g);

    let result = [];
    let token = '';

    const append = (token) => {
        if (token !== '') result.push(token);
    }

    let doubleQuoted = false;
    let htmlDepth = 0;
    for(const ch of line) {
        if (doubleQuoted) {
            if (ch === '"') {
                append(token); token = '';
                doubleQuoted = false;
            }
            else {
                token = token + ch;
            }
            continue;
        }

        if (htmlDepth > 0) {
            if (ch === '<') htmlDepth += 1;
            else if (ch === '>') htmlDepth -= 1;

            token = token + ch;
            if (htmlDepth === 0) {
                append(token); token = '';
            }
            continue;
        }

        switch(ch) {
            case '[':
            case ']':
            case '=':
            case ':':
                append(token); token = '';
                append(ch);
                break;
            case ' ':
            case ';':
                append(token); token = '';
                break;
            case '"':
                doubleQuoted = true;
                break;
            case '<':
                htmlDepth = 1; token = '<';
                break;
            default:
                token = token + ch;
        }
    }
    append(token);

    return result;
}

dot.ModelFactory = class {

    match(context) {
        const identifier = context.identifier;
        const extension = identifier.split('.').pop().toLowerCase();
        // Todo: match 제대로 구현
        return true;

        switch (extension) {
            default:
                try {
                    const reader = base.TextReader.create(context.stream.peek(), 65536);
                    for (;;) {
                        const line = reader.read();
                        if (line === undefined) {
                            break;
                        }
                        const text = line.trim();
                        const textArray = text.split(' ');
                        if ((textArray[0] === 'digraph' || textArray[0] === 'graph') && text.endsWith('{')) {
                            return true;
                        }
                        return false;
                    }
                }
                catch (err) {
                    // continue regardless of error
                }
                break;
        }
        return false;
    }

    open(context) {
        return dot.Metadata.open(context).then((metadata) => {
            const open = (metadata, cfg) => {
                return new dot.Model(metadata, cfg);
            };

            return open(metadata, context.stream.peek());
        });
    }
};

dot.Model = class {
    constructor(metadata, cfg) {
        this._graphs = [ new dot.Graph(metadata, cfg), new dot.Graph() ];
    }

    get format() {
        return 'Dot';
    }

    get graphs() {
        return this._graphs;
    }
};

dot.Graph = class {

    constructor(metadata, cfg) {
        this._name = 'normal';
        this._inputs = [];
        this._outputs = [];
        this._nodes = [];

        if (!metadata && !cfg) {
            this._name = 'asdf';
            return;
        }

        const sections = new Map();
        const reader = base.TextReader.create(cfg);
        let lineNumber = 0;

        let allText = '';
        for (;;) {
            lineNumber++;
            const line = reader.read();
            if (line === undefined) {
                break;
            }

            allText += ' ' + line;
        }

        const tokens = tokenize(allText);

        const consume = (expected) => {
            const token = tokens.shift();
            if (token === undefined || (expected && expected !== token)) {
                throw new Error(`Unexpected token ${token}. Expected was: ${expected}`);
                // raise error?
            }
            return token;
        };

        const nextToken = () => {
            return tokens[0];
        };

        const getSection = (sectionName) => {
            //if section is already exist, doesn't push to sections
            if (!sections.has(sectionName)) {
                sections.set(sectionName, new dot.Section(sectionName));
            }

            return sections.get(sectionName);
        }

        const scopeStack = [];
        const types = new Set();
        while (tokens.length > 0) {
            const token = consume();

            // Todo: 처리
            if (token.startsWith('rankdir')) {
                consume();
                consume();
                continue;
            }

            if (token === 'digraph' || token === 'subgraph') {
                const graphName = consume();
                scopeStack.push(graphName);
                consume('{');
                continue;
            }

            if (token === '}') {
                scopeStack.pop();
                continue;
            }

            const sectionName = token;
            // edge
            if (nextToken() === '->') {
                consume();
                const dstSectionName = consume();
                if (nextToken() === ':') {
                    consume(':');
                    consume();
                }
                if (nextToken() === '[') {
                    while(consume() !== ']');
                }

                getSection(dstSectionName).updateInput(token);
            }
            // node description
            else if (nextToken() == '['){
                consume('[');
                const properties = {};
                while (nextToken() != ']') {
                    const key = consume();
                    consume('=');
                    const value = consume();
                    properties[key] = value;
                }
                consume(']');

                // HTML caseions.
                let type;
                const label = properties['label'];
                const options = {}

                if (label === undefined) {
                    type = null;
                }
                else if (label.startsWith('<')) {
                    const regex = /\<TD colspan='[0-9]+'\>(O[0-9]+\] )?(.*?)\</;
                    const matchResult = label.match(regex);
                    if (!matchResult) {
                        throw new Error(`Unknown expected label format. label: ${label}`);
                    }
                    else {
                        type = matchResult[2];
                    }
                    types.add(type);

                    const separator = `<BR ALIGN='left'/>`
                    const opts = label.split(separator).slice(1, -1);

                    // Todo: 괄호 파싱

                    // options parsing
                    // for (const opt of opts) {
                    //     const res = opt.split(':');
                    //     options[res[0]] = res[1];
                    // }
                }
                else {
                    type = "Tensor";
                    if (label.includes("no buffer")) {
                        options['buffer'] = 0;
                    }
                    else {
                        const regex = /buffer ([0-9]+)B/;
                        // Todo: match 안되는 경우 handle
                        const mResult = label.match(regex);

                        if (mResult) {
                            options['buffer'] = mResult[1];
                        }
                    }
                }

                if (!properties['xlabel'])
                    options['xlabel'] = properties['xlabel']

                if (properties['label'])
                    options['label'] = properties['label']

                const section = getSection(sectionName);
                for (const key in options) {
                    section.updateOption(key, options[key]);
                }

                if (type !== null) {
                    section.updateType(type);
                }
            }
            else {
                // graph label
                if (token === 'label' && nextToken() === '=') {
                    consume('=');
                    const graphLabel = consume();
                }
                else {
                    throw new Error(`Unexpected token ${token}`);
                }
            }
        }
        sections.forEach(section => this._nodes.push(new dot.Node(metadata, section)));
    }

    get name() {
        return this._name;
    }

    get groups() {
        //Todo: return true
        return false;
    }

    get inputs() {
        return this._inputs;
    }

    get outputs() {
        return this._outputs;
    }

    get nodes() {
        return this._nodes;
    }
};

dot.Parameter = class {
    constructor(name, visible, args) {
        this._name = name;
        this._visible = visible;
        this._arguments = args;
    }

    get name() {
        return this._name;
    }

    get visible() {
        return this._visible;
    }

    get arguments() {
        return this._arguments;
    }
};

dot.Argument = class {

    constructor(name, type, initializer) {
        if (typeof name !== 'string') {
            throw new dot.Error("Invalid argument identifier '" + JSON.stringify(name) + "'.");
        }
        this._name = name;
        this._type = type || null;
        this._initializer = initializer || null;
    }

    get name() {
        return this._name;
    }

    get type() {
        if (this._initializer) {
            return this._initializer.type;
        }
        return this._type;
    }

    get initializer() {
        return this._initializer;
    }
};

dot.Tensor = class {

    constructor(type, data) {
        this._type = type;
        this._data = data;
    }

    get kind() {
        return 'Tensor';
    }

    get name() {
        return '';
    }

    get type() {
        return this._type;
    }

    get state() {
        return this._context().state;
    }

    get value() {
        const context = this._context();
        if (context.state) {
            return null;
        }
        context.limit = Number.MAX_SAFE_INTEGER;
        return this._decode(context, 0);
    }

    toString() {
        const context = this._context();
        if (context.state) {
            return '';
        }
        context.limit = 10000;
        const value = this._decode(context, 0);
        return JSON.stringify(value, null, 4);
    }

    _context() {
        const context = {};
        if (!this._data) {
            context.state = 'Tensor data is empty.';
            return context;
        }
        context.state = null;
        context.position = 0;
        context.count = 0;
        context.dataView = new DataView(this._data.buffer, this._data.byteOffset, this._data.byteLength);
        context.dimensions = this.type.shape.dimensions;
        return context;
    }

    _decode(context, dimension) {
        const results = [];
        const size = context.dimensions[dimension];
        if (dimension == context.dimensions.length - 1) {
            for (let i = 0; i < size; i++) {
                if (context.count > context.limit) {
                    results.push('...');
                    return results;
                }
                results.push(context.dataView.getFloat32(context.position, true));
                context.position += 4;
                context.count++;
            }
        }
        else {
            for (let j = 0; j < size; j++) {
                if (context.count > context.limit) {
                    results.push('...');
                    return results;
                }
                results.push(this._decode(context, dimension + 1));
            }
        }
        return results;
    }
};

dot.TensorType = class {

    constructor(dataType, shape) {
        this._dataType = dataType;
        this._shape = shape;
    }

    get dataType() {
        return this._dataType;
    }

    get shape() {
        return this._shape;
    }

    toString() {
        return (this._dataType || '?') + this._shape.toString();
    }
};

dot.TensorShape = class {

    constructor(dimensions) {
        if (dimensions.some((dimension) => dimension === 0 || dimension === undefined || isNaN(dimension))) {
            throw new dot.Error("Invalid tensor shape '" + JSON.stringify(dimensions) + "'.");
        }
        this._dimensions = dimensions;
    }

    get dimensions() {
        return this._dimensions;
    }

    toString() {
        if (this._dimensions) {
            if (this._dimensions.length == 0) {
                return '';
            }
            return '[' + this._dimensions.map((dimension) => dimension.toString()).join(',') + ']';
        }
        return '';
    }
};



dot.Section = class {
    constructor(name) {
        this._name = name;
        this._chain = [];
        this._layer = {
            inputs: [],
            weights: [],
            outputs: [
                new dot.Parameter(name, true, null),
            ]
        };
        this._line = 1;
        this._type = null;
        this._options = {};
    }

    updateInput(input) {
        this._layer.inputs.push(new dot.Parameter(input, true, null));
    }

    updateOutput(output) {
        this._layer._outputs.push(new dot.Parameter(output, true, null));
    }

    updateOption(key, value) {
        this._options[key] = value;
    }

    updateType(type) {
        this._type = type;
    }

    get name() {
        return this._name;
    }

    get chain() {
        return this._chain;
    }
    get layer() {
        return this._layer;
    }
    get line() {
        return this._line;
    }
    get type() {
        return this._type;
    }
    get options() {
        return this._options;
    }
};

dot.Node = class {

    constructor(metadata, section) {
        this._name = section.name || '';
        this._location = section.line !== undefined ? section.line.toString() : undefined;
        // this._metadata = metadata;
        this._type = section.type;
        this._metadata = metadata;
        this._attributes = [];
        this._inputs = [];
        this._outputs = [];
        this._chain = [];
        const layer = section.layer;
        this._inputs.push(new dot.Parameter(section.options['label'], true, [new dot.Argument('furiosa-plaintext', null, new dot.Tensor(new dot.TensorType('float32', new dot.TensorShape([1, 13, 13])), null))]));

        if (layer && layer.inputs && layer.inputs.length > 0) {
            this._inputs.push(new dot.Parameter(layer.inputs.length <= 1 ? 'input' : 'inputs', true, layer.inputs));
            // this._inputs.push(new dot.Parameter('2', true, [new dot.Argument('q', null, new dot.Tensor(new dot.TensorType('float32', new dot.TensorShape([1, 13, 50, 13])), null))]));
            // this._inputs.push(new dot.Parameter('3', true, [new dot.Argument('c', null, new dot.Tensor(new dot.TensorType('float32', new dot.TensorShape([13])), null))]));
            // this._inputs.push(new dot.Parameter('4', true, [new dot.Argument('s', null, new dot.Tensor(new dot.TensorType('float32', new dot.TensorShape([1, 25, 40, 13, 13])), null))]));
            // this._inputs.push(new dot.Parameter('5', true, [new dot.Argument('a', null, new dot.Tensor(new dot.TensorType('float32', new dot.TensorShape([1, 13])), null))]));
        }
        // if (layer && layer.weights && layer.weights.length > 0) {
        //     this._inputs = this._inputs.concat(layer.weights);
        // }
        if (layer && layer.outputs && layer.outputs.length > 0) {
            this._outputs.push(new dot.Parameter(layer.outputs.length <= 1 ? 'output' : 'outputs', true, layer.outputs));
        }
        // if (section.chain) {
        //     for (const chain of section.chain) {
        //         this._chain.push(new dot.Node(metadata, net, chain, ''));
        //     }
        // }
        const options = section.options;
        if (options) {
            for (const key of Object.keys(options)) {
                this._attributes.push(new dot.Attribute({}, key, options[key]));
            }
        }
    }

    get name() {
        return this._name;
    }

    get location() {
        return this._location;
    }

    get type() {
        return this._type;
    }

    get metadata() {
        return this._metadata.type(this._type);
    }

    get attributes() {
        return this._attributes;
    }

    get inputs() {
        return this._inputs;
    }

    get outputs() {
        return this._outputs;
    }

    get chain() {
        return this._chain;
    }
};

dot.Attribute = class {

    constructor(schema, name, value) {
        this._name = name;
        this._value = value;
        if (schema) {
            this._type = schema.type || '';
            switch (this._type) {
                case 'int32': {
                    const number = parseInt(this._value, 10);
                    if (Number.isInteger(number)) {
                        this._value = number;
                    }
                    break;
                }
                case 'float32': {
                    const number = parseFloat(this._value);
                    if (!isNaN(number)) {
                        this._value = number;
                    }
                    break;
                }
                case 'int32[]': {
                    const numbers = this._value.split(',').map((item) => parseInt(item.trim(), 10));
                    if (numbers.every((number) => Number.isInteger(number))) {
                        this._value = numbers;
                    }
                    break;
                }
            }
            if (Object.prototype.hasOwnProperty.call(schema, 'visible') && !schema.visible) {
                this._visible = false;
            }
            else if (Object.prototype.hasOwnProperty.call(schema, 'default')) {
                if (this._value == schema.default) {
                    this._visible = false;
                }
            }
        }
    }

    get name() {
        return this._name;
    }

    get type() {
        return this._type;
    }

    get value() {
        return this._value;
    }

    get visible() {
        return this._visible == false ? false : true;
    }
};

dot.Metadata = class {

    static open(context) {
        if (dot.Metadata._metadata) {
            return Promise.resolve(dot.Metadata._metadata);
        }
        return context.request('dot-metadata.json', 'utf-8', null).then((data) => {
            dot.Metadata._metadata = new dot.Metadata(data);
            return dot.Metadata._metadata;
        }).catch(() => {
            dot.Metadata._metadata = new dot.Metadata(null);
            return dot.Metadata._metadata;
        });
    }

    constructor(data) {
        this._map = new Map();
        this._attributeMap = new Map();
        if (data) {
            const items = JSON.parse(data);
            if (items) {
                for (const item of items) {
                    if (item && item.name && item.schema) {
                        if (this._map.has(item.name)) {
                            throw new dot.Error("Duplicate metadata key '" + item.name + "'.");
                        }
                        item.schema.name = item.name;
                        this._map.set(item.name, item.schema);
                    }
                }
            }
        }
    }

    type(name) {
        return this._map.get(name) || null;
    }

    attribute(type, name) {
        const key = type + ':' + name;
        if (!this._attributeMap.has(key)) {
            this._attributeMap.set(key, null);
            const schema = this.type(type);
            if (schema && schema.attributes) {
                for (const attribute of schema.attributes) {
                    this._attributeMap.set(type + ':' + attribute.name, attribute);
                }
            }
        }
        return this._attributeMap.get(key);
    }
};

dot.Error = class extends Error {

    constructor(message) {
        super(message);
        this.name = 'Error loading Dot model.';
    }
};

if (typeof module !== 'undefined' && typeof module.exports === 'object') {
    module.exports.ModelFactory = dot.ModelFactory;
}

