var ecurve = require('ecurve');
var BigInteger = require('bigi');
var Buffer = require('Buffer');
var secp256r1 = require('secp256k1');
var BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
var base58 = require('base-x')(BASE58);

function ab2str(buf) {
  return String.fromCharCode.apply(null, new Uint8Array(buf));
}

function str2ab(str) {
  var bufView = new Uint8Array(str.length);
  for (var i = 0,
         strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return bufView;
}

function hexstring2ab(str) {
  var result = [];
  while (str.length >= 2) {
    result.push(parseInt(str.substring(0, 2), 16));
    str = str.substring(2, str.length);
  }

  return result;
}

function ab2hexstring(arr) {
  var result = "";
  for (i = 0; i < arr.length; i++) {
    var str = arr[i].toString(16);
    str = str.length == 0 ? "00": str.length == 1 ? "0" + str: str;
    result += str;
  }
  return result;
}

function reverseArray(arr) {
  var result = new Uint8Array(arr.length);
  for (i = 0; i < arr.length; i++) {
    result[i] = arr[arr.length - 1 - i];
  }

  return result;
}

function numStoreInMemory(num, length) {
  if (num.length % 2 == 1) {
    num = '0' + num;
  }

  for (i = num.length; i < length; i++) {
    num = '0' + num;
  }

  var data = reverseArray(new Buffer(num, "HEX"));

  return ab2hexstring(data);
}

function stringToBytes(str) {
  var utf8 = unescape(encodeURIComponent(str));

  var arr = [];
  for (var i = 0; i < utf8.length; i++) {
    arr.push(utf8.charCodeAt(i));
  }

  return arr;
}

function prefixInteger(num, length) {
  return (new Array(length).join('0') + num).slice( - length);
}

var WalletMath = function() {};
WalletMath.add = function(arg1, arg2) {
  return Decimal.add(arg1, arg2);
};
WalletMath.sub = function(arg1, arg2) {
  return Decimal.sub(arg1, arg2);
};
WalletMath.mul = function(arg1, arg2) {
  return Decimal.mul(arg1, arg2);
};
WalletMath.div = function(arg1, arg2) {
  return Decimal.div(arg1, arg2);
};
WalletMath.eq = function(arg1, arg2) {
  return new Decimal(arg1).eq(arg2);
};
WalletMath.lt = function(arg1, arg2) {
  // if (arg1 < arg2) return true;
  return new Decimal(arg1).lessThan(arg2);
};
WalletMath.lessThanOrEqTo = function(arg1, arg2) {
  // if (arg1 <= arg2) return true;
  return new Decimal(arg1).lessThanOrEqualTo(arg2);
};
WalletMath.fixView = function(arg) {
  return arg.toFixed(new Decimal(arg).dp());
};
WalletMath.toHex = function(arg) {
  var retData = new Decimal(arg).toHexadecimal();
  return retData.toString().substring(2); // Del 0x.
};
WalletMath.hexToNumToStr = function(arg) {
  return new Decimal("0x" + arg).toString();
};
WalletMath.toThousands = function (num) {
  let numStart = '';
  let numEnd = '';
  let result = '';
  let dotLocal = num.indexOf(".");

  if (dotLocal === -1) {
    numStart = num;
  } else {
    numStart = num.substr(0, dotLocal);
    numEnd = num.substr(dotLocal);
  }

  while (numStart.length > 3) {
    result = ',' + numStart.slice(-3) + result;
    numStart = numStart.slice(0, numStart.length - 3);
  }
  if (numStart) {
    result = numStart + result;
  }

  return result + numEnd;
};

/**************************************************************
 * Wallet Class.
 * Wallet api.
 * 钱包API。
 *
 * @param passwordHash
 * @param iv
 * @param masterKey
 * @param publicKeyHash
 * @param privateKeyEncrypted
 * @constructor
 */
var Wallet = function Wallet(passwordHash, iv, masterKey, publicKeyHash, privateKeyEncrypted) {
  this.passwordHash = passwordHash;
  this.iv = iv;
  this.masterKey = masterKey;
  this.publicKeyHash = publicKeyHash;
  this.privateKeyEncrypted = privateKeyEncrypted;
};

/**
 * Create account use random private key.
 * 新建一个账户。
 *
 * @param $privateKey
 * @param $password
 *
 * @return $binaryArray : struct Account
 */
Wallet.createAccount = function($privateKey, $password) {
  var publicKey = Wallet.getPublicKey($privateKey, false);
  var publicKeyEncoded = Wallet.getPublicKey($privateKey, true);
  var scriptCode = Wallet.createSignatureScript(publicKeyEncoded);
  var scriptHash = Wallet.getHash(scriptCode);
  var publicKeyHash = Wallet.getHash(publicKeyEncoded.toString('hex'));
  var passwordKey = CryptoJS.SHA256(CryptoJS.SHA256($password));
  var passwordHash = CryptoJS.SHA256(passwordKey);
  var iv = Wallet.generateRandomArray(16);
  var masterKey = Wallet.generateRandomArray(32);
  var masterKeyPlain = CryptoJS.enc.Hex.parse(ab2hexstring(masterKey));
  var key = CryptoJS.enc.Hex.parse(passwordKey.toString());
  var ivData = CryptoJS.enc.Hex.parse(ab2hexstring(iv));
  var masterKeyEncrypt = CryptoJS.AES.encrypt(masterKeyPlain, key, {
    iv: ivData,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.NoPadding
  });
  var privateKeyData = publicKey.slice(1, 65).toString('hex') + $privateKey;
  var privateKeyDataPlain = CryptoJS.enc.Hex.parse(privateKeyData);
  var privateKeyDataEncrypted = CryptoJS.AES.encrypt(privateKeyDataPlain, masterKeyPlain, {
    iv: ivData,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.NoPadding
  });

  var db = new SQL.Database();

  var sqlstr = "CREATE TABLE Account ( PublicKeyHash BINARY NOT NULL CONSTRAINT PK_Account PRIMARY KEY, PrivateKeyEncrypted VARBINARY NOT NULL );";
  sqlstr += "CREATE TABLE Address ( ScriptHash BINARY NOT NULL CONSTRAINT PK_Address PRIMARY KEY );";
  sqlstr += "CREATE TABLE Coin ( TxId BINARY  NOT NULL, [Index] INTEGER NOT NULL, AssetId BINARY NOT NULL, ScriptHash BINARY  NOT NULL, State INTEGER NOT NULL, Value INTEGER NOT NULL, CONSTRAINT PK_Coin PRIMARY KEY ( TxId, [Index] ), CONSTRAINT FK_Coin_Address_ScriptHash FOREIGN KEY ( ScriptHash ) REFERENCES Address (ScriptHash) ON DELETE CASCADE );";
  sqlstr += "CREATE TABLE Contract ( ScriptHash BINARY NOT NULL CONSTRAINT PK_Contract PRIMARY KEY, PublicKeyHash BINARY NOT NULL, RawData VARBINARY NOT NULL, CONSTRAINT FK_Contract_Account_PublicKeyHash FOREIGN KEY ( PublicKeyHash ) REFERENCES Account (PublicKeyHash) ON DELETE CASCADE, CONSTRAINT FK_Contract_Address_ScriptHash FOREIGN KEY ( ScriptHash ) REFERENCES Address (ScriptHash) ON DELETE CASCADE );";
  sqlstr += "CREATE TABLE [Key] ( Name VARCHAR NOT NULL CONSTRAINT PK_Key PRIMARY KEY, Value VARBINARY NOT NULL );";
  sqlstr += "CREATE TABLE [Transaction] ( Hash BINARY NOT NULL CONSTRAINT PK_Transaction PRIMARY KEY, Height INTEGER, RawData VARBINARY NOT NULL, Time TEXT NOT NULL, Type INTEGER NOT NULL );";
  db.run(sqlstr);

  var stmtAccount = db.prepare("INSERT INTO Account(PublicKeyHash,PrivateKeyEncrypted) VALUES (?,?)");
  stmtAccount.run([hexstring2ab(publicKeyHash.toString()), hexstring2ab(privateKeyDataEncrypted.ciphertext.toString())]);
  stmtAccount.free();

  var stmtAddress = db.prepare("INSERT INTO Address(ScriptHash) VALUES (?)");
  stmtAddress.run([hexstring2ab(scriptHash.toString())]);
  stmtAddress.free();

  var stmtContract = db.prepare("INSERT INTO Contract(ScriptHash,PublicKeyHash,RawData) VALUES (?,?,?)");
  stmtContract.run([hexstring2ab(scriptHash.toString()), hexstring2ab(publicKeyHash.toString()), hexstring2ab(publicKeyHash.toString() + "010023" + scriptCode)]);
  stmtContract.free();

  var stmtKey = db.prepare("INSERT INTO Key(Name,Value) VALUES (?,?)");
  stmtKey.run(['PasswordHash', hexstring2ab(passwordHash.toString())]);
  stmtKey.free();

  stmtKey = db.prepare("INSERT INTO Key(Name,Value) VALUES (?,?)");
  stmtKey.run(['IV', iv]);
  stmtKey.free();

  stmtKey = db.prepare("INSERT INTO Key(Name,Value) VALUES (?,?)");
  stmtKey.run(['MasterKey', hexstring2ab(masterKeyEncrypt.ciphertext.toString())]);
  stmtKey.free();

  stmtKey = db.prepare("INSERT INTO Key(Name,Value) VALUES (?,?)");
  stmtKey.run(['Version', hexstring2ab("01000000060000000000000000000000")]);
  stmtKey.free();

  stmtKey = db.prepare("INSERT INTO Key(Name,Value) VALUES (?,?)");
  stmtKey.run(['Height', hexstring2ab("00000000")]);
  stmtKey.free();

  var binaryArray = db.export();

  return binaryArray;
};

/**
 *
 * @param $data
 * @return {string}
 * @constructor
 */
Wallet.Sha256 = function($data) {
  var DataHexString = CryptoJS.enc.Hex.parse($data);
  var DataSha256 = CryptoJS.SHA256(DataHexString);

  return DataSha256.toString();
};

Wallet.SM3 = function($data) {
  var x = sm3();
  var DataHexString = hexstring2ab($data);
  return ab2hexstring(x.sum(DataHexString));
};

Wallet.MD5 = function($data) {
  var DataHexString = CryptoJS.enc.Hex.parse($data);
  return CryptoJS.MD5(DataHexString).toString();
};

/**
 *
 * @param $data
 * @return {string}
 * @constructor
 */
Wallet.GetTxHash = function($data) {
  var DataHexString = CryptoJS.enc.Hex.parse($data);
  var DataSha256 = CryptoJS.SHA256(DataHexString);
  var DataSha256_2 = CryptoJS.SHA256(DataSha256);

  return DataSha256_2.toString();
};

/**
 *
 *
 * @param orderNum
 * @return {{firstVal: *, length: number, inputNum: string}}
 * @constructor
 */
Wallet.InputDataLength = function(orderNum) {
  let firstVal = orderNum + 1;
  let len = 0;
  let inputNum = orderNum + 1;

  if (orderNum < 253) {
    len = 1;
    inputNum = numStoreInMemory(inputNum.toString(16), 2)
  } else if (orderNum < 65535) {
    firstVal = 253;
    len = 3;
    inputNum = numStoreInMemory(inputNum.toString(16), 4)
  } else if (orderNum < 4294967295) {
    firstVal = 254;
    len = 5;
    inputNum = numStoreInMemory(inputNum.toString(16), 8)
  } else {
    firstVal = 255;
    len = 9;
    inputNum = numStoreInMemory(inputNum.toString(16), 16)
  }

  return {
    firstVal: numStoreInMemory(firstVal.toString(16), 2),
    length: len,
    inputNum: inputNum
  }
};

Wallet.GetInputData = function($coin, $amount) {
  // sort
  var coin_ordered = $coin['Utxo'];
  for (i = 0; i < coin_ordered.length - 1; i++) {
    for (j = 0; j < coin_ordered.length - 1 - i; j++) {
      if (WalletMath.lt(coin_ordered[j].Value, coin_ordered[j + 1].Value)) {
        var temp = coin_ordered[j];
        coin_ordered[j] = coin_ordered[j + 1];
        coin_ordered[j + 1] = temp;
      }
    }
  }

  var sum = 0;
  for (i = 0; i < coin_ordered.length; i++) {
    sum = WalletMath.add(sum, coin_ordered[i].Value);
  }

  var amount = $amount;
  if (WalletMath.lt(sum, amount)) return - 1;

  var k = 0;
  while (WalletMath.lessThanOrEqTo(coin_ordered[k].Value, amount)) {
    amount = WalletMath.sub(amount, coin_ordered[k].Value);
    if (amount == 0) break;
    k = k + 1;
  }

  var lengthData = this.InputDataLength(k);

  /////////////////////////////////////////////////////////////////////////
  // coin[0]- coin[k]
  var data = new Uint8Array(lengthData.length + 34 * (k + 1));

  // input num
  if (lengthData.length === 1) {
    data.set(hexstring2ab(lengthData.inputNum));
  } else {
    data.set(hexstring2ab(lengthData.firstVal));
    data.set(hexstring2ab(lengthData.inputNum), 1);
  }

  // input coins
  for (var x = 0; x < k + 1; x++) {
    // txid
    var pos = lengthData.length + (x * 34);
    data.set(reverseArray(hexstring2ab(coin_ordered[x]['Txid'])), pos);

    // index
    pos = lengthData.length + (x * 34) + 32;
    inputIndex = numStoreInMemory(coin_ordered[x]['Index'].toString(16), 4);
    data.set(hexstring2ab(inputIndex), pos);
  }

  // calc coin_amount
  var coin_amount = 0;
  for (i = 0; i < k + 1; i++) {
    coin_amount = WalletMath.add(coin_amount, coin_ordered[i].Value);
  }

  return {
    amount: coin_amount,
    data: data
  }
};

/**
 * Make issue transaction and get transaction unsigned data.
 * 发起一个发行资产交易和获取交易数据（十六进制）。
 *
 * @param $issueAssetID
 * @param $issueAmount
 * @param $publicKeyEncoded
 *
 * @returns {string} : TxUnsignedData
 */
Wallet.makeIssueTransaction = function($issueAssetID, $issueAmount, $publicKeyEncoded) {
  var signatureScript = Wallet.createSignatureScript($publicKeyEncoded);
  var myProgramHash = Wallet.getHash(signatureScript);
  var type = "01";
  var version = "00";
  var transactionAttrNum = "01";
  var transactionAttrUsage = "00";
  var transactionAttrData = ab2hexstring(stringToBytes(parseInt(99999999 * Math.random())));
  var transactionAttrDataLen = prefixInteger(Number(transactionAttrData.length / 2).toString(16), 2);
  var transactionInputNum = "00";
  var transactionOutputNum = "01";
  var transactionOutputAssetID = ab2hexstring(reverseArray(hexstring2ab($issueAssetID)));
  num1 = $issueAmount * 100000000;
  var transactionOutputAmount = numStoreInMemory(num1.toString(16), 16);
  var transactionOutputProgramHash = myProgramHash.toString();

  return type + version + transactionAttrNum + transactionAttrUsage + transactionAttrDataLen + transactionAttrData + transactionInputNum + transactionOutputNum + transactionOutputAssetID + transactionOutputAmount + transactionOutputProgramHash;
};

/**
 * Make register transaction and get transaction unsigned data.
 * 发起一个注册资产交易和获取交易数据（十六进制）。

 * @param $assetName
 * @param $assetAmount
 * @param $publicKeyEncoded
 *
 * @returns {string} : txUnsignedData
 */
Wallet.makeRegisterTransaction = function($assetName, $assetAmount, $publicKeyEncoded) {
  var ecParams = ecurve.getCurveByName('secp256r1');
  var curvePt = ecurve.Point.decodeFrom(ecParams, new Buffer($publicKeyEncoded, "hex"));
  var publicKeyXStr = (curvePt.affineX.toBuffer(32)).toString('hex');
  var publicKeyYStr = (curvePt.affineY.toBuffer(32)).toString('hex');

  var type = "40";
  var version = "00";

  var assetNameLen = prefixInteger((Number($assetName.length).toString(16)), 2);
  var assetName = ab2hexstring(stringToBytes($assetName));
  var assetDescLen = assetNameLen;
  var assetDesc = assetName;

  var assetPrecision = "08"; //精度
  var assetType = "01";
  var assetRecordType = "00";
  var assetAmount = numStoreInMemory(($assetAmount * 100000000).toString(16), 16);

  var publicKey = "20" + publicKeyXStr + "20" + publicKeyYStr;
  var programHash = Wallet.getHash(Wallet.createSignatureScript($publicKeyEncoded)).toString();

  var transactionAttrNum = "01";
  var transactionAttrUsage = "00";
  var transactionAttrData = ab2hexstring(stringToBytes(parseInt(99999999 * Math.random())));
  var transactionAttrDataLen = prefixInteger(Number(transactionAttrData.length / 2).toString(16), 2);

  var transactionInputNum = "00";
  var transactionOutputNum = "00";
  return type + version + assetNameLen + assetName + assetDescLen + assetDesc + assetPrecision + assetType + assetRecordType + assetAmount + publicKey + programHash + transactionAttrNum + transactionAttrUsage + transactionAttrDataLen + transactionAttrData + transactionInputNum + transactionOutputNum;
};

/**
 *
 * @param $txData
 * @param $sign
 * @param $publicKeyEncoded
 * @return {string}
 * @constructor
 */
Wallet.AddContract = function($txData, $sign, $publicKeyEncoded) {
  var Num = "01";
  var structLen = "41";
  var dataLen = "40";
  var data = $sign;
  var contractDataLen = "23";
  var signatureScript = Wallet.createSignatureScript($publicKeyEncoded);

  return $txData + Num + structLen + dataLen + data + contractDataLen + signatureScript;
};

/**
 * Address to program hash.
 * 地址转脚本哈希。
 *
 * @param $toAddress
 * @return {number}
 *
 * @constructor
 */
Wallet.AddressToProgramHash = function($toAddress) {
  var ProgramHash = base58.decode($toAddress);
  var ProgramHexString = CryptoJS.enc.Hex.parse(ab2hexstring(ProgramHash.slice(0, 21)));
  var ProgramSha256 = CryptoJS.SHA256(ProgramHexString);
  var ProgramSha256_2 = CryptoJS.SHA256(ProgramSha256);
  var ProgramSha256Buffer = hexstring2ab(ProgramSha256_2.toString());

  if (ab2hexstring(ProgramSha256Buffer.slice(0, 4)) != ab2hexstring(ProgramHash.slice(21, 25))) {
    return - 1;
  }

  return ab2hexstring(ProgramHash);
};

/**
 *
 * @param $toAddress
 * @return {boolean}
 * @constructor
 */
Wallet.VerifyAddress = function($toAddress) {
  var ProgramHash = base58.decode($toAddress);
  var ProgramHexString = CryptoJS.enc.Hex.parse(ab2hexstring(ProgramHash.slice(0, 21)));
  var ProgramSha256 = CryptoJS.SHA256(ProgramHexString);
  var ProgramSha256_2 = CryptoJS.SHA256(ProgramSha256);
  var ProgramSha256Buffer = hexstring2ab(ProgramSha256_2.toString());

  if (ab2hexstring(ProgramSha256Buffer.slice(0, 4)) != ab2hexstring(ProgramHash.slice(21, 25))) {
    return false;
  }

  return true;
};

/**
 *
 * @param $publicKeyEncoded
 * @return {boolean}
 * @constructor
 */
Wallet.VerifyPublicKeyEncoded = function($publicKeyEncoded) {
  var publicKeyArray = hexstring2ab($publicKeyEncoded);
  if (publicKeyArray[0] != 0x02 && publicKeyArray[0] != 0x03) {
    return false;
  }

  var ecparams = ecurve.getCurveByName('secp256r1');
  var curvePt = ecurve.Point.decodeFrom(ecparams, new Buffer($publicKeyEncoded, "hex"));
  var curvePtX = curvePt.affineX.toBuffer(32);
  var curvePtY = curvePt.affineY.toBuffer(32);

  if (publicKeyArray[0] == 0x02 && curvePtY[31] % 2 == 0) {
    return true;
  }

  if (publicKeyArray[0] == 0x03 && curvePtY[31] % 2 == 1) {
    return true;
  }

  return false;
};

/**
 * Make transfer transaction and get transaction unsigned data.
 * 发起一个转账交易数据（十六进制）。
 *
 * @param $coin
 * @param $publicKeyEncoded
 * @param $toAddress
 * @param $Amount
 *
 * @returns {*} : TxUnsignedData
 */
Wallet.makeTransferTransaction = function($coin, $publicKeyEncoded, $toAddress, $Amount) {
  var ProgramHash = base58.decode($toAddress);
  var ProgramHexString = CryptoJS.enc.Hex.parse(ab2hexstring(ProgramHash.slice(0, 21)));
  var ProgramSha256 = CryptoJS.SHA256(ProgramHexString);
  var ProgramSha256_2 = CryptoJS.SHA256(ProgramSha256);
  var ProgramSha256Buffer = hexstring2ab(ProgramSha256_2.toString());

  if (ab2hexstring(ProgramSha256Buffer.slice(0, 4)) !== ab2hexstring(ProgramHash.slice(21, 25))) {
    //address verify failed.
    return - 1;
  }

  ProgramHash = ProgramHash.slice(1, 21);

  var signatureScript = Wallet.createSignatureScript($publicKeyEncoded);
  var myProgramHash = Wallet.getHash(signatureScript);

  var inputData = Wallet.GetInputData($coin, $Amount);
  if (inputData === -1) return null;
  var inputAmount = inputData.amount;

  var accuracyVal = 100000000;
  var newOutputAmount = WalletMath.mul($Amount, accuracyVal);
  var newInputAmount = WalletMath.sub(WalletMath.mul(inputAmount, accuracyVal), newOutputAmount);

  var type = "80";
  var version = "00";
  var transactionAttrNum = "01";
  var transactionAttrUsage = "00";
  var transactionAttrData = ab2hexstring(stringToBytes(parseInt(WalletMath.mul(99999999, Math.random()))));
  var transactionAttrDataLen = prefixInteger(Number(transactionAttrData.length / 2).toString(16), 2);
  var referenceTransactionData = ab2hexstring(inputData.data);

  var data = type + version + transactionAttrNum + transactionAttrUsage + transactionAttrDataLen + transactionAttrData + referenceTransactionData;

  // OUTPUT
  var transactionOutputNum = "01"; //无找零
  var transactionOutputAssetID = ab2hexstring(reverseArray(hexstring2ab($coin['AssetId'])));
  var transactionOutputValue = numStoreInMemory(WalletMath.toHex(newOutputAmount), 16);
  var transactionOutputProgramHash = ab2hexstring(ProgramHash);

  if (WalletMath.eq(inputAmount, $Amount)) {
    data += transactionOutputNum + transactionOutputAssetID + transactionOutputValue + transactionOutputProgramHash;
  } else {
    transactionOutputNum = "02"; //有找零
    data += transactionOutputNum + transactionOutputAssetID + transactionOutputValue + transactionOutputProgramHash;

    var transactionOutputValue_me = numStoreInMemory(WalletMath.toHex(newInputAmount), 16);
    var transactionOutputProgramHash_me = myProgramHash.toString();
    data += transactionOutputAssetID + transactionOutputValue_me + transactionOutputProgramHash_me;
  }

  return data;
};

Wallet.ClaimTransaction = function($claims, $publicKeyEncoded, $toAddress, $Amount) {
  var signatureScript = Wallet.createSignatureScript($publicKeyEncoded);
  var myProgramHash = Wallet.getHash(signatureScript);

  /**
   * data
   * @type {string}
   */
  var type = "02";
  var version = "00";
  var claimLen = numStoreInMemory($claims['claims'].length.toString(16), 2);
  var claim = '';
  for (var k = 0; k < $claims['claims'].length; k++) {
    claim += ab2hexstring(reverseArray(hexstring2ab($claims['claims'][k]['txid'])));
    claim += numStoreInMemory($claims['claims'][k]['vout'].toString(16), 4);
  }
  var attribute = "00";
  var inputs = "00";
  var outputs = "01";
  var output_assetId = ab2hexstring(reverseArray(hexstring2ab($claims['assetid'])));
  var output_amount = numStoreInMemory(parseInt($Amount).toString(16), 16);

  return type + version + claimLen + claim + attribute + inputs + outputs + output_assetId + output_amount + myProgramHash.toString();
};

Wallet.toAddress = function($ProgramHash) {
  var data = new Uint8Array(1 + $ProgramHash.length);
  data.set([23]);
  data.set($ProgramHash, 1);

  var ProgramHexString = CryptoJS.enc.Hex.parse(ab2hexstring(data));
  var ProgramSha256 = CryptoJS.SHA256(ProgramHexString);
  var ProgramSha256_2 = CryptoJS.SHA256(ProgramSha256);
  var ProgramSha256Buffer = hexstring2ab(ProgramSha256_2.toString());

  var datas = new Uint8Array(1 + $ProgramHash.length + 4);
  datas.set(data);
  datas.set(ProgramSha256Buffer.slice(0, 4), 21);

  return base58.encode(datas);
};

Wallet.generateRandomArray = function($arrayLen) {
  var randomArray = new Uint8Array($arrayLen);
  for (i = 0; i < $arrayLen; i++) {
    randomArray[i] = Math.floor(Math.random() * 256);
  }

  return randomArray;
};

Wallet.generatePrivateKey = function() {
  var privateKey = new Uint8Array(32);
  for (i = 0; i < 32; i++) {
    privateKey[i] = Math.floor(Math.random() * 256);
  }

  return privateKey;
};

Wallet.getPublicKey = function($privateKey, $encode) {
  var ecparams = ecurve.getCurveByName('secp256r1');
  var curvePt = ecparams.G.multiply(BigInteger.fromBuffer(hexstring2ab($privateKey)));
  return curvePt.getEncoded($encode);
};

Wallet.getPublicKeyEncoded = function($publicKey) {
  var publicKeyArray = hexstring2ab($publicKey);
  if (publicKeyArray[64] % 2 == 1) {
    return "03" + ab2hexstring(publicKeyArray.slice(1, 33));
  } else {
    return "02" + ab2hexstring(publicKeyArray.slice(1, 33));
  }
};

Wallet.createSignatureScript = function($publicKeyEncoded) {
  return "21" + $publicKeyEncoded.toString('hex') + "ac";
};

Wallet.getHash = function($SignatureScript) {
  var ProgramHexString = CryptoJS.enc.Hex.parse($SignatureScript);
  var ProgramSha256 = CryptoJS.SHA256(ProgramHexString);
  return CryptoJS.RIPEMD160(ProgramSha256);
};

Wallet.getReverse = function($data) {
  ab = hexstring2ab($data);
  len = ab.length;
  for (i = 0; i < len / 2; i++) {
    temp = ab[i];
    ab[i] = ab[len - i - 1];
    ab[len - i - 1] = temp;
  }
  return ab2hexstring(ab);
};

Wallet.signatureData = function($data, $privateKey) {
  var msg = CryptoJS.enc.Hex.parse($data);
  var msgHash = CryptoJS.SHA256(msg);
  var pubKey = secp256r1.publicKeyCreate(new Buffer($privateKey, "HEX"));
  var signature = secp256r1.sign(new Buffer(msgHash.toString(), "HEX"), new Buffer($privateKey, "HEX"));

  return signature.signature.toString('hex');
};

Wallet.GetAccountsFromPublicKeyEncoded = function($publicKeyEncoded) {
  if (!Wallet.VerifyPublicKeyEncoded($publicKeyEncoded)) {
    return - 1
  }

  var accounts = [];
  var publicKeyHash = Wallet.getHash($publicKeyEncoded);
  var script = Wallet.createSignatureScript($publicKeyEncoded);
  var programHash = Wallet.getHash(script);
  var address = Wallet.toAddress(hexstring2ab(programHash.toString()));

  accounts[0] = {
    privatekey: '',
    publickeyEncoded: $publicKeyEncoded,
    publickeyHash: publicKeyHash.toString(),
    programHash: programHash.toString(),
    address: address
  };

  return accounts;
};

/**
 * @return {number}
 */
Wallet.GetAccountsFromPrivateKey = function($privateKey) {
  if ($privateKey.length != 64) {
    return - 1;
  }

  var accounts = [];
  var publicKeyEncoded = Wallet.getPublicKey($privateKey, true);
  var publicKeyHash = Wallet.getHash(publicKeyEncoded.toString('hex'));
  var script = Wallet.createSignatureScript(publicKeyEncoded);
  var programHash = Wallet.getHash(script);
  var address = Wallet.toAddress(hexstring2ab(programHash.toString()));

  accounts[0] = {
    privatekey: $privateKey,
    publickeyEncoded: publicKeyEncoded.toString('hex'),
    publickeyHash: publicKeyHash.toString(),
    programHash: programHash.toString(),
    address: address
  };

  return accounts;
};

Wallet.decryptWallet = function(wallet, password) {
  var accounts = [];
  var passwordhash1 = CryptoJS.SHA256(password);
  var passwordhash2 = CryptoJS.SHA256(passwordhash1);
  var passwordhash3 = CryptoJS.SHA256(passwordhash2);
  if (passwordhash3.toString() != ab2hexstring(wallet.passwordHash)) {
    return - 1;
  }

  var data = CryptoJS.enc.Hex.parse(ab2hexstring(wallet.masterKey));
  var dataBase64 = CryptoJS.enc.Base64.stringify(data);
  var key = CryptoJS.enc.Hex.parse(passwordhash2.toString());
  var iv = CryptoJS.enc.Hex.parse(ab2hexstring(wallet.iv));

  var plainMasterKey = CryptoJS.AES.decrypt(dataBase64, key, {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.NoPadding
  });

  for (k = 0; k < wallet.privateKeyEncrypted.length; k++) {
    var privateKeyEncrypted = CryptoJS.enc.Hex.parse(ab2hexstring(wallet.privateKeyEncrypted[k]));
    var privateKeyBase64 = CryptoJS.enc.Base64.stringify(privateKeyEncrypted);
    var plainprivateKey = CryptoJS.AES.decrypt(privateKeyBase64, plainMasterKey, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.NoPadding
    });

    var privateKeyHexString = plainprivateKey.toString().slice(128, 192);
    var ecparams = ecurve.getCurveByName('secp256r1');
    var curvePt = ecparams.G.multiply(BigInteger.fromBuffer(hexstring2ab(privateKeyHexString)));
    var publicKeyEncoded = curvePt.getEncoded(true);
    var publicKeyEncodedHexString = CryptoJS.enc.Hex.parse(publicKeyEncoded.toString('hex'));
    var publicKeyEncodedSha256 = CryptoJS.SHA256(publicKeyEncodedHexString);
    var publicKeyHash = CryptoJS.RIPEMD160(publicKeyEncodedSha256);
    var ProgramHexString = CryptoJS.enc.Hex.parse("21" + publicKeyEncoded.toString('hex') + "ac");
    var ProgramSha256 = CryptoJS.SHA256(ProgramHexString);
    var ProgramHash = CryptoJS.RIPEMD160(ProgramSha256);
    var address = Wallet.toAddress(hexstring2ab(ProgramHash.toString()));

    if (publicKeyHash.toString() != ab2hexstring(wallet.publicKeyHash[k])) {
      return - 2;
    }

    accounts[k] = {
      privatekey: privateKeyHexString,
      publickeyEncoded: publicKeyEncoded.toString('hex'),
      publickeyHash: publicKeyHash.toString(),
      programHash: ProgramHash.toString(),
      address: address
    };
  }

  return accounts;
};

/**
 * Analyze the obtained electronic money.
 * 返回计算好的币。
 *
 * @param res
 * @return {Array}
 */
Wallet.analyzeCoins = function(res) {
  if (res.status == 200) {
    var results = res.data.Result;
    var newCoins = [];

    if (results !== null) {
      var coins = [];
      var tmpIndexArr = [];

      for (let i = 0; i < results.length; i++) {
        coins[i] = results[i];
        coins[i].balance = 0;
        coins[i].balanceView = 0;
        coins[i].balanceViewFormat = 0;
        coins[i].AssetID = ab2hexstring(hexstring2ab(results[i]['AssetId']));
        coins[i].AssetIDRev = ab2hexstring(reverseArray(hexstring2ab(results[i]['AssetId'])));
        if (results[i].Utxo != null) {
          for (j = 0; j < results[i].Utxo.length; j++) {
            coins[i].balance = WalletMath.add(coins[i].balance, results[i].Utxo[j].Value);
          }
          coins[i].balanceView = WalletMath.fixView(coins[i].balance);
          coins[i].balanceViewFormat = WalletMath.toThousands(coins[i].balanceView);
        }

        tmpIndexArr.push(results[i].AssetName);
      }

      tmpIndexArr = tmpIndexArr.sort();
      for (i = 0; i < results.length; i++) {
        for (j = 0; j < results.length; j++) {
          if (tmpIndexArr[i] == results[j].AssetName) {
            newCoins.push(results[j]);
          }
        }
      }
    }

    return newCoins;
  } else {
    return [];
  }
};

/**
 *
 * @param $http
 * @param $address
 * @param $host
 * @param $callback
 * @param $callbackDev
 * @constructor
 */
Wallet.GetClaims = function($http, $address, $host, $callback, $callbackDev) {
  $http({
    method: 'GET',
    url: $host.webapi_host + ':' + $host.webapi_port + '/api/v1/address/get_claims/' + $address
  }).then($callback).
  catch($callbackDev);
};

/**
 * Get information about user accounts, transactions, etc.
 * 获取用户账户、交易等信息
 *
 * @param $http
 * @param $address
 * @param $host
 * @param $callback
 * @param $callbackDev
 * @constructor
 */
Wallet.GetUnspent = function($http, $address, $host, $callback, $callbackDev) {
  $http({
    method: 'GET',
    url: $host.restapi_host + ':' + $host.restapi_port + '/api/v1/asset/utxos/' + $address
  }).then($callback).catch($callbackDev);
};

/**
 * Refresh the height of node
 * 刷新节点高度
 *
 * @param $http
 * @param $host
 * @param $callback
 * @param $callbackDev
 * @constructor
 */
Wallet.GetNodeHeight = function($http, $host, $callback, $callbackDev) {
  $http({
    method: 'GET',
    url: $host.restapi_host + ':' + $host.restapi_port + '/api/v1/block/height?auth_type=getblockheight'
  }).then($callback).catch($callbackDev);
};

/**
 * Initiate a transaction
 * 发起交易
 *
 * @param $http
 * @param $txData
 * @param $host
 * @param $callback
 * @param $callbackDev
 * @constructor
 */
Wallet.SendTransactionData = function($http, $txData, $host, $callback, $callbackDev) {
  $http({
    method: 'POST',
    url: $host.restapi_host + ':' + $host.restapi_port + '/api/v1/transaction',
    data: '{"Action":"sendrawtransaction", "Version":"1.0.0", "Type":"","Data":"' + $txData + '"}',
    headers: {
      "Content-Type": "application/json"
    }
  }).then($callback).catch($callbackDev);
};

Wallet.AjaxGet = function ($http, url, $callback, $catch) {
  $http({method: 'GET', url: url}).then($callback).catch($catch);
};
