import json
import sys
from database import get_database, Database

# DATABASE_CONFIG_FILE = "./database.cnf"
#
# try:
#     with open(DATABASE_CONFIG_FILE) as f:
#       config = json.load(f)
# except IOError as err:
#     print("Cannot open configuration: %s. Exiting" % (str(err)))
#     sys.exit(1)

config = json.loads("""
{
    "database": {
        "host": "contextubot.cao16ctra0vs.us-east-1.rds.amazonaws.com",
        "user": "contextubot",
        "passwd": "Ieleewoughahg6nabee9ahDeghooqu6D",
        "db": "ebdb"
    }
}
""")

db_cls = get_database(config.get("database_type", None))
# db_cls = get_database("mysql")

db = db_cls(**config.get("database", {}))
db.setup()

import numpy as np

# For reading/writing hashes to file
import struct

# Format string for writing binary data to file
HASH_FMT = '<2i'
HASH_MAGIC = 'audfprinthashV00'  # 16 chars, FWIW
PEAK_FMT = '<2i'
PEAK_MAGIC = 'audfprintpeakV00'  # 16 chars, FWIW

def hashes_load(hashfilename):
    """ Read back a set of hashes written by hashes_save """
    hashes = []
    fmtsize = struct.calcsize(HASH_FMT)
    with open(hashfilename, 'rb') as f:
        magic = f.read(len(HASH_MAGIC))
        if magic != HASH_MAGIC:
            raise IOError('%s is not a hash file (magic %s)'
                          % (hashfilename, magic))
        data = f.read(fmtsize)
        while data is not None and len(data) == fmtsize:
            hashes.append(struct.unpack(HASH_FMT, data))
            data = f.read(fmtsize)
    return hashes


###############################################################

hashes = hashes_load(sys.argv[1])
print len(hashes)

id = db.insert_song(sys.argv[3], sys.argv[2]);
db.insert_hashes(id, hashes);

###############################################################

# hashes = hashes_load('./Samples/program1.afpt')
# print len(hashes)
#
# id = db.insert_song('program1', '0001');
# db.insert_hashes(id, hashes);
#
# hashes = hashes_load('./Samples/program2.afpt')
# print len(hashes)
#
# id = db.insert_song('program2', '0001');
# db.insert_hashes(id, hashes);
#
# hashes = hashes_load('./Samples/program3.afpt')
# print len(hashes)
#
# id = db.insert_song('program3', '0001');
# db.insert_hashes(id, hashes);
#
# hashes = hashes_load('./Samples/program4.afpt')
# print len(hashes)
#
# id = db.insert_song('program4', '0001');
# db.insert_hashes(id, hashes);
#
# hashes = hashes_load('./Samples/program5.afpt')
# print len(hashes)
#
# id = db.insert_song('program5', '0001');
# db.insert_hashes(id, hashes);

################################################################

# hashes = hashes_load('./Samples/viral.afpt')
# print len(hashes)
#
# a = []
#
# for hash in hashes:
#     print hash
#     hash_ = '{:x}'.format(hash[1])
#     print(hash_)
#     r = list(db.query(hash_))
#     print(r)
#     b = { 'hash': hash_, 'time': hash[0],'matches': r }
#     a.append(b)
#
# print json.dumps(a)
