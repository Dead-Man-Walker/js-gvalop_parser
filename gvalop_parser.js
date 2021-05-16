```gvalop_parser.py parses a string of Grouped VALues and OPerators into
a group tree of values, operators, and subgroups, which can then be evaluated.

A group is represented by a grouping object, identified by a start and an end string,
and stores its child objects in a list.
An operators is identified by a representation string and an operator function.
The parser is initialized with a list of operators and a list of groupings.

Starting with a root group, the parser parses a string from left to right, building up a tree of groups,
operators and values, with the last two constituting tree leaves. The parsing returns the populated
root group.
Evaluating a group, usually the root group, with an optional evaluation
function for each value, collapses the tree into a single result by consuming each contained item
recursively into a result object.

The consumption of any item turn itself into and replaces itself with a result object:
A group consumes itself by consuming each contained item recursively.
An operator consumes itself by consuming its involved operand(s) and applying the operator function on
the result operand(s).
A value consumes itself by applying its evaluation function on itself.
A result is already consumed and thus does not change.

In order to be able reevaluate a group tree more than once (for different evaluation functions),
since consumption collapses the tree, the evaluation of a group happens on a copy of that group.


Example:

    # A list of songs we want to filter by artists through a parsed string
    songs_list = [
        "Bob Marley - Jammin",
        "Stephen Marley - Break Us Apart",
        "Stephen & Damian Marley - Medication",
        "Ziggy Marley - Dragonfly",
        "Duane Stephenson - Exhale",
        "Tanya Stephens - It's a Pity"
    ]

    # The string to be parsed. Here we want to filter for songs that must contain a
    # 'marley' in any case, while also containing a 'stephen' with neither
    # a 'ziggy' nor a 'damian', or a 'bob'
    artists_filter = "marley && (stephen && !(ziggy || damian) || bob)"

    # Creating a set of operators. Here we use the three logical operators AND, OR, and NOT
    import operator

    opAnd = OperatorBinary(representation="&&", func=operator.and_)
    opOr = OperatorBinary(representation="||", func=operator.or_)
    opNot = OperatorUnary(representation="!", func=operator.not_)

    # Creating a grouping
    grouping = Grouping("(", ")")

    # Creating the parser with the just created operators and grouping
    parser = Parser(operators=[opAnd, opOr, opNot], groupings=[grouping])

    # Parse the filter string and fetch the returned root group
    root = parser.parse(artists_filter)

    # Setup a filter function that (re)evaluates the parsed root
    # for each song
    def songInFilterValue(song):
        result = root.evaluate(
            lambda parser_value: parser_value in song.lower()
        )
        return result.value

    # Filter the songs list
    filtered_list = [
        song for song in songs_list if songInFilterValue(song)

    ]

    print(filtered_list)
    # >>> ['Bob Marley - Jammin', 'Stephen Marley - Break Us Apart']

```


/*Provides a default consume method intended to be overwritten to consume itself*/
class Consumable{
    /*
    Consumes itself at items[index] and updates the items list with a Result.
    This process may consume other items of the list as well.
    Returns (<modified items>, <modified current index>)
    */
    consume(items, index, func=None) {
        return (items, index)
    }
}

/*
A Group stores contained, nested items as its children to be consumed together. It holds
a reference to its parent group and is framed by the given grouping
*/
class Group extends Consumable{
    constructor(parent=null, grouping=null){
        super();
        this.parent = parent;
        this.grouping = grouping;
        this.children = [];
    }

    toString(){
        return `Group(${
            this.children.map(child => child.toString()).join(',')
        })`;
    }

    get length(){
        return this.children.reduce((acc, child) => acc + child.length);
    }

    /* Returns the character count of the parsed string that has been consumed up to this point */
    get consumed_length(){
        let consumed_length = 0;
        if('consumed_length' in this.children[0])
            consumed_length = this.children[0].consumed_length;
        if(this.parent === null)
            return consumed_length;
        if(this.parent.children[0] === this)
            return consumed_length + this.grouping.start.length;
        for(const parent_child in this.parent.children){
            if(parent_child === this)
                break;
            if('consumed_length' in parent_child){
                consumed_length += parent_child.consumed_length
            }else{
                consumed_length += parent_child.length;
            }
        }
        return consumed_length+1;
    }

    createDeepCopy(){
        const copy = new this.constructor(
            this.parent,
            this.grouping.createDeepCopy()
        );
        copy.children = this.children.map(child => child.createDeepCopy());
        return copy;
    }

    consume(items=null, index=null, func=null){
        let child_i = 0;
        while(child < this.children.length){
            try{
                [this.children, child_i] = this.children[child_i].consume(this.children, child_i, func);
            }catch (e){
                if(!(e instanceof InvalidOperandError))
                    throw e;
                if(e.index !== null)
                    throw e;
                throw new InvalidOperandError(`An operator at index ${this.consumed_length+1}
                    encountered an invalid operand`, this.consumed_length+1)
            }
            if(child_i !== 0)
                throw new MissingOperatorError(`An operator is missing after index ${this.consumed_length+1}`,
                    this.consumed_length+1);
            child_i++;
        }
        const result = this.children[0];
        if(this.grouping !== null)
            result.consumed_length += this.grouping.length;
        if(items === null || index === null)
            return result;
        items[index] = result;
        return [items, index];
    }

    /*
    Evaluates itself on a copy, as to not consume the source group, optionally supplying an
    evaluation function. If no evaluation function is supplied, the default one supplied by the parser
    is used
    */
    evaluate(func=null){
        const copy = this.createDeepCopy();
        return copy.consume(null, null, func);
    }
}


class Grouping{
    constructor(start, end){
        this.start = start;
        this.end = end;
    }

    toString(){
        return `Grouping(${this.start},${this.end})`;
    }

    get length(){
        return this.start.length, this.end.length;
    }

    createDeepCopy(){
        return new this.constructor(this.start, this.end);
    }
}

/*
An Operator is identified by a representation string and consumes items as operands
through the given operator function
*/
class Operator extends Consumable{
    constructor(representation, func){
        super();
        this.representation = representation;
        this.func = func;
    }

    toString(){
        return `Op(${this.representation})`;
    }

    get length(){
        return this.representation.length;
    }

    createDeepCopy(){
        return new this.constructor(this.representation, this.func);
    }
}


/* A binary operator that consumes its neighboring items to the left and right as an operand */
class OperatorBinary extends Operator{
    consume(items, index, func = None){
        const left = items[index-1];
        const right = items[index+1];
        if(typeof left === "undefined" || typeof right === "undefined")
            throw new InvalidOperandError("Left or right operand is missing");
        if(!(left instanceof Result))
            throw new InvalidOperandError("Left operand is not a Result object");
        [items, _] = right.consume(items, index+1, func);
        const consumed_length = left.consumed_length + this.length + items[index+1].consumed_length;
        const result_value = this.func(left.value, items[index+1].value);
        items[index] = new Result(result_value, consumed_length);
        delete items[index+1];
        delete items[index-1];
        return [items, index-1];
    }
}


/* A unary operator that consumes its right neighboring item as an operand */
class OperatorUnary extends Operator{
    consume(items, index, func = None) {
        const right = items[index+1];
        if(typeof right === "undefined")
            throw new InvalidOperandError("Right operand is missing");
        [items, _] = right.consume(items, index+1, func);
        const consumed_length = this.length + items[index+1].consumed_length;
        const result = new Result(self.func(items[index+1].value), consumed_length);
        items[index] = result;
        delete items[index+1];
        return [items, index];
    }
}

/*
A Value contains the continuous characters of the parsed string between groups and operators.
It takes an evaluation function that gets executed on its value during consumption
 */
class Value extends Consumable{
    constructor(func, value="") {
        super();
        this.func = func;
        this.value = value;
    }

    toString(){
        return `Value(${this.value})`;
    }

    get length(){
        return this.value.length;
    }

    createDeepCopy(){
        return new this.constructor(this.func, this.value);
    }

    consume(items, index, func = None) {
        if(func !== null)
            this.func = func;
        const result = new Result(this.func(this.value), this.length);
        items[index] = result;
        return [items, index];
    }
}

/*
A Result is the result of an item being consumed. It contains its final value and the
character count of the parsed string that has been consumed for this object
 */
class Result extends Consumable{
    constructor(value, consumed_length){
        super();
        this.value = value;
        this.consumed_length = consumed_length;
    }

     toString(){
        return `Result(${this.value})`;
     }

     createDeepCopy(){
        return new this.constructor(this.value, this.consumed_length);
     }
}
/*
Base class for all parsing related error.
It optionally takes an index, indicating the index of the parsed string at which the error was raised
 */
class ParserError extends Error {
    constructor(msg=null, index=null, ...params){
        if(msg === null)
            msg = "An error occured while parsing. This is probably due to invalid syntax.";
        super(msg, ...params);
        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ParserError);
        }
        this.index = index;
    }
}


/*
Error indicating that an operator was expected. This may happen, for example, when a value directly
follows a group, or when a unary operator follows a value
 */
class MissingOperatorError extends ParserError {
}


/*
Error indicating that an operator was passed an invalid operand. This may happen, for example, when
a parsed string ends with a unary operator and is thus missing its right operand, or for two
consecutive binary operators
 */
class InvalidOperandError extends ParserError {
}


/*
The Parser parses a string from left to right into a Group tree, taking a list of Operators
and a list of Groupings
 */
class Parser{
    constructor(operators, groupings, ValueClass=Value, GroupClass=Group){
        this.operators = operators;
        this.groupings = groupings;
        this.ValueClass = Value;
        this.GroupClass = Group;
        this.evaluation_func = null;
    }

    _tryConsumeGroupStart(data){
        for(const grouping in this.groupings){
            if(this._isSubstringAtIndex(data["string"], data["index"], grouping.start)){
                data["current_value"] = this._pushValue(data["current_group"], data["current_value"]);
                const new_group = new this.GroupClass(data["current_group"], grouping);
                data["current_group"].children.append(new_group);
                data["current_group"] = new_group;
                data["index"] += grouping.start.length;
                return true;
            }
        }
        return false;
    }

    _tryConsumeGroupEnd(data){
        if(data["current_group"].grouping === null)
            return false;
        if(this._isSubstringAtIndex(data["string"], data["index"], data["current_group"].grouping.end)){
            const grouping_end_len = data["current_group"].grouping.end.length;
            data["current_value"] = this._pushValue(data["current_group"], data["current_value"]);
            data["current_group"] = data["current_group"].parent;
            data["index"] += grouping_end_len;
            return true;
        }
        return false;
    }

    _tryConsumeOperator(data){
        for(const op in this.operators){
            if(this._isSubstringAtIndex(data["string"], data["index"], op.representation)){
                data["current_value"] = this._pushValue(data["current_group"], data["current_value"]);
                data["current_group"].children.append(op);
                data["index"] += op.length;
                return true;
            }
        }
        return false;
    }

    _consumeValue(data) {
        data["current_value"].value += data["string"][data["index"]]
        data["index"] += 1
    }

    _isSubstringAtIndex(self, string, index, sub){
        return string.substr(index, sub.length) === sub;
    }


    _getNewValue(){
        return new this.ValueClass(this.evaluation_func);
    }
    _pushValue(self, group, value) {
        value.value = value.value.trim();
        if(value.value) {
            group.children.append(value);
            value = this._getNewValue();
        }
        return value;
    }

    /*
    Parses a string into a Group tree and returns the root group.
    The evalutation function is used as a default for all created Values, but
    other evaluation functions may be passed and used when evaluation a group
    */
    parse(string, evaluation_func=(x=>x)){
        this.evaluation_func = evaluation_func;
        const root = new Group();

        const data = {
            "string" : string,
            "index": 0,
            "current_group": root,
            "current_value": this._getNewValue()
        };

        while(data["index"] < data["string"].length){
            if(this._tryConsumeGroupStart(data))
                continue;
            if(this._tryConsumeGroupEnd(data))
                continue;
            if(this._tryConsumeOperator(data))
                continue;
            this._consumeValue(data);
        }

        this._pushValue(data["current_group"], data["current_value"]);
        return root;
    }
}


